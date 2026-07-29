/**
 * 소리 기능(오디오) 3~6단계 — `POST /audio/sightings/upload`, `POST /audio/identify`.
 *
 * `docs/audio/API_CONTRACT.md`를 그대로 구현한다. 실제 변환/저장/멱등성 로직은
 * `AudioUploadService`(core/audio/), 실제 동정 로직은 `AudioIdentificationGateway`
 * (core/audio/identification/)에 있고, 이 라우트는 (1) 인증·소유권 확인 (2) 서비스 호출
 * (3) 에러를 계약이 정의한 코드로 매핑하는 얇은 계층이다(사진 파이프라인의
 * sightings.routes.ts와 같은 얇은-라우트/두꺼운-서비스 분리).
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import {
  audioSightingToUploadResponse,
  audioIdentificationOutcomeToResponse,
  audioConfirmResultToResponse,
  audioSimilarityScoreToResponse,
  speciesSoundsToResponse,
} from "../mappers.js";
import { UnsupportedAudioFormatError } from "../../core/audio/AudioSignature.js";
import { AudioConversionError } from "../../core/audio/AudioConverter.js";
import { asAudioSightingId, asObservationId, asTaxonId } from "../../core/domain/ids.js";
import type { AudioSighting } from "../../core/audio/audioTypes.js";
import { signMediaToken, verifyMediaToken } from "../../core/media/mediaToken.js";
import { checkAudioHealth } from "../../core/audio/audioHealth.js";

const identifyBodySchema = {
  type: "object",
  required: ["audio_sighting_id"],
  properties: { audio_sighting_id: { type: "string", minLength: 1 } },
} as const;
interface IdentifyBody {
  audio_sighting_id: string;
}

const confirmBodySchema = {
  type: "object",
  required: ["audio_sighting_id", "species_id", "confirmation_id"],
  properties: {
    audio_sighting_id: { type: "string", minLength: 1 },
    species_id: { type: "string", minLength: 1 },
    confirmation_id: { type: "string", minLength: 1 },
  },
} as const;
interface ConfirmBody {
  audio_sighting_id: string;
  species_id: string;
  confirmation_id: string;
}

const similarityScoreBodySchema = {
  type: "object",
  required: ["audio_sighting_id", "species_id", "mode"],
  properties: {
    audio_sighting_id: { type: "string", minLength: 1 },
    species_id: { type: "string", minLength: 1 },
    mode: { type: "string" },
  },
} as const;
interface SimilarityScoreBody {
  audio_sighting_id: string;
  species_id: string;
  mode: string;
}

/** `docs/audio/API_CONTRACT.md` "Common rules"의 에러 응답 형태. */
function audioError(
  error: string,
  message: string,
  opts: { retryable?: boolean; withTraceId?: boolean } = {},
) {
  const body: Record<string, unknown> = { error, message, retryable: opts.retryable ?? false };
  if (opts.withTraceId ?? true) body.trace_id = `trace_${randomUUID()}`;
  return body;
}

export function registerAudioRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
  jwtSecret: string,
): void {
  server.post("/audio/sightings/upload", { preHandler: authenticate }, async (request, reply) => {
    const ctx = requireAuthContext(request);

    let audioBuffer: Buffer | undefined;
    let clientRecordingId: string | undefined;
    let durationMsField: string | undefined;
    let recordedAt: string | undefined;
    let mode: string | undefined;

    for await (const part of request.parts()) {
      if (part.type === "file" && part.fieldname === "audio") {
        audioBuffer = await part.toBuffer();
      } else if (part.type === "field") {
        const value = String(part.value);
        if (part.fieldname === "client_recording_id") clientRecordingId = value;
        else if (part.fieldname === "duration_ms") durationMsField = value;
        else if (part.fieldname === "recorded_at") recordedAt = value;
        else if (part.fieldname === "mode") mode = value;
        // lat/lng: API_CONTRACT.md에 정의돼 있지만 3단계 스키마(audio_sighting)에는 아직
        // 저장 컬럼이 없다 — 파싱만 하고 무시한다(2026-07-28, 스코프 결정. 필요해지면
        // 별도 마이그레이션으로 컬럼을 추가한다).
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return reply.code(400).send(audioError("audio_invalid_format", "오디오 파일이 없습니다."));
    }
    if (!clientRecordingId || !durationMsField || !recordedAt || !mode) {
      return reply
        .code(400)
        .send(
          audioError(
            "audio_invalid_format",
            "필수 필드가 누락됐습니다. (client_recording_id, duration_ms, recorded_at, mode)",
          ),
        );
    }
    if (mode !== "ambient") {
      return reply
        .code(400)
        .send(audioError("audio_invalid_format", "mode는 'ambient'여야 합니다(MVP 고정값)."));
    }
    if (audioBuffer.length > app.config.audio.maxBytes) {
      return reply
        .code(413)
        .send(
          audioError(
            "audio_too_large",
            `오디오 파일이 너무 큽니다. 최대 ${Math.floor(app.config.audio.maxBytes / (1024 * 1024))}MB까지 허용됩니다.`,
          ),
        );
    }

    try {
      const sighting = await app.audioUpload.upload({
        userId: ctx.userId,
        clientRecordingId,
        audioBytes: audioBuffer,
        clientDurationMs: Number(durationMsField),
        recordedAt,
      });
      // 품질 거부(422)도 형식 오류(400)와 다른 응답 형태다 — API_CONTRACT.md 1장
      // "Quality rejection (422): see fixtures/upload-quality-rejected.json" — 에러 객체가
      // 아니라 성공 응답과 같은 shape(audio_sighting_id/status/quality/expires_at)을 그대로
      // 쓰고 상태 코드만 다르다(라우트가 새로 매핑할 필드가 없음).
      const statusCode = sighting.status === "rejected" ? 422 : 200;
      return reply.code(statusCode).send(audioSightingToUploadResponse(sighting));
    } catch (err) {
      if (err instanceof UnsupportedAudioFormatError) {
        return reply.code(400).send(audioError("audio_invalid_format", err.message));
      }
      if (err instanceof AudioConversionError) {
        if (err.code === "timeout") {
          return reply
            .code(503)
            .send(
              audioError("audio_processor_unavailable", "오디오 처리 시간이 초과됐습니다.", {
                retryable: true,
              }),
            );
        }
        // decode_failed / too_long — 둘 다 "이 요청 자체가 처리할 수 없는 형태"라
        // audio_invalid_format으로 묶는다(계약에 별도 코드가 없음 — 15초 초과는 정상
        // 클라이언트라면 녹음 단계에서 이미 막았어야 하는 이상 케이스, STATE_MACHINE.md
        // "Reject local duration below 3 seconds"와 대칭되는 클라이언트 책임).
        return reply.code(400).send(audioError("audio_invalid_format", err.message));
      }
      throw err;
    }
  });

  server.delete<{ Params: { audioSightingId: string } }>(
    "/audio/sightings/:audioSightingId",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const id = asAudioSightingId(request.params.audioSightingId);
      const sighting = await app.repos.audioSightings.get(id);

      // 존재하지 않는 세션과 다른 사용자의 세션을 같은 404로 처리해 존재 여부를
      // 노출하지 않는다. 앱은 재녹음/화면 종료 시 이 API로 미확정 음원을 즉시 폐기한다.
      if (!sighting || sighting.userId !== ctx.userId) {
        return reply.code(404).send(audioError("not_found", "오디오 세션을 찾을 수 없습니다."));
      }

      // TTL 정리와 동일하게 파일을 먼저 지운 뒤 DB 행을 지운다. 파일 삭제가 실패했는데
      // 행부터 지우면 고아 음원이 남아 이후 자동 정리도 할 수 없으므로 503으로 재시도시킨다.
      try {
        if (sighting.storagePath) await app.audioTempStore.delete(sighting.storagePath);
        await app.repos.audioSightings.deleteById(id);
      } catch {
        return reply
          .code(503)
          .send(audioError("audio_processor_unavailable", "오디오 삭제에 실패했습니다.", { retryable: true }));
      }

      return reply.code(204).send();
    },
  );

  server.post<{ Body: IdentifyBody }>(
    "/audio/identify",
    { preHandler: authenticate, schema: { body: identifyBodySchema } },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const sighting = await app.repos.audioSightings.get(asAudioSightingId(request.body.audio_sighting_id));

      // "Missing, expired, deleted, or another user's sighting returns the same 404
      // not_found response"(API_CONTRACT.md §2). 품질 거부(rejected)도 여기 합친다 —
      // STATE_MACHINE.md가 rejected 세션의 허용 동작을 "결과 읽기, 삭제"로만 못박아 identify를
      // 애초에 허용하지 않는다(존재 자체를 숨기는 404가 아니라 "이 동작은 할 수 없음"과
      // 같은 취급 — 계약이 별도 코드를 안 뒀으므로 새 에러 코드를 만들지 않는다).
      const expired = sighting ? new Date(sighting.expiresAt).getTime() <= Date.now() : false;
      if (!sighting || sighting.userId !== ctx.userId || sighting.status !== "ready" || expired) {
        return reply.code(404).send(audioError("not_found", "오디오 세션을 찾을 수 없습니다."));
      }

      // status==='ready'는 항상 storagePath가 있다(AudioUploadService 설계) — 없으면 우리
      // 쪽 데이터 불일치이지 클라이언트 잘못이 아니므로 404가 아니라 503으로 정직하게 알린다.
      const wavBytes = sighting.storagePath ? await app.audioTempStore.read(sighting.storagePath) : null;
      if (!wavBytes) {
        return reply
          .code(503)
          .send(audioError("audio_processor_unavailable", "오디오 파일을 읽을 수 없습니다.", { retryable: true }));
      }

      try {
        const outcome = await app.audioIdentification.identify(wavBytes);
        await app.repos.audioIdentificationResults.upsert({
          audioSightingId: sighting.id,
          candidates: outcome.candidates,
          unknown: outcome.unknown,
          unknownReason: outcome.unknownReason,
          modelProvider: app.config.audio.model.name,
          modelVersion: outcome.modelVersion,
          locationPriorUsed: outcome.locationPriorUsed,
          createdAt: new Date().toISOString(),
        });
        return reply.code(200).send(audioIdentificationOutcomeToResponse(sighting.id, outcome));
      } catch {
        // doc03 9장 "모델 오류는 5xx로 반환" — 사진 게이트웨이처럼 삼켜서 unknown으로
        // 감추지 않는다(AudioIdentificationGateway.ts 상단 주석 참고).
        return reply
          .code(503)
          .send(audioError("audio_processor_unavailable", "동정 모델 서비스에 연결할 수 없습니다.", { retryable: true }));
      }
    },
  );

  server.post<{ Body: ConfirmBody }>(
    "/audio/identify/confirm",
    { preHandler: authenticate, schema: { body: confirmBodySchema } },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const sighting = await app.repos.audioSightings.get(asAudioSightingId(request.body.audio_sighting_id));

      // 미존재/남의 것/만료/품질거부(rejected)는 identify와 같은 404로 합친다 — rejected는
      // 애초에 동정을 거친 적이 없어 확정할 후보 스냅샷 자체가 없다. 'confirmed'는 여기서
      // 걸러내지 않는다 — 이미 확정된 세션의 재요청(멱등 재생/충돌 판정)은 아래
      // confirmationId 분기가 처리한다(API_CONTRACT.md §3 "같은 confirmation_id는 원본 응답").
      const expired = sighting ? new Date(sighting.expiresAt).getTime() <= Date.now() : false;
      if (!sighting || sighting.userId !== ctx.userId || expired || sighting.status === "rejected") {
        return reply.code(404).send(audioError("not_found", "오디오 세션을 찾을 수 없습니다."));
      }

      // confirmationId가 이미 설정돼 있다 = 누군가(같거나 다른 요청)가 이미 확정을 클레임했다.
      // status가 아직 'ready'(finalize 직전 경합)든 'confirmed'(완료)든 이 분기가 처리한다.
      if (sighting.confirmationId) {
        return respondForClaimedSighting(sighting, request.body.confirmation_id, reply);
      }

      const result = await app.repos.audioIdentificationResults.get(sighting.id);
      if (!result) {
        return reply
          .code(400)
          .send(audioError("not_identified_yet", "먼저 /audio/identify를 호출하세요."));
      }
      const chosen = result.candidates.find((c) => c.speciesId === request.body.species_id);
      if (!chosen) {
        return reply
          .code(400)
          .send(audioError("invalid_species_id", "동정 후보에 없는 종입니다."));
      }

      // 원자적 클레임 — WHERE confirmation_id IS NULL이라 동시에 도착한 여러 확정 요청 중
      // 정확히 하나만 성공한다(ACCEPTANCE.md 시나리오 7 "3회 반복해도 관찰 1건").
      const claimed = await app.repos.audioSightings.claimConfirmation(
        sighting.id,
        request.body.confirmation_id,
      );
      if (!claimed) {
        const fresh = await app.repos.audioSightings.get(sighting.id);
        // claimConfirmation이 false를 반환했다는 건 누군가 먼저 confirmationId를 설정했다는
        // 뜻이라 fresh.confirmationId는 항상 존재한다(데이터 불일치가 아닌 한).
        if (!fresh?.confirmationId) {
          return reply
            .code(503)
            .send(audioError("audio_processor_unavailable", "확정 처리 중 문제가 발생했습니다.", { retryable: true }));
        }
        return respondForClaimedSighting(fresh, request.body.confirmation_id, reply);
      }

      const taxon = await app.repos.taxa.get(chosen.speciesId);
      if (!taxon) {
        // 클레임은 이미 확보했지만(confirmationId 설정됨) 아래에서 관찰 기록에 실패한 채로
        // 응답하는 셈 — taxon 소실은 동정 후보에 있던 종이 그새 지워진 데이터 불일치라
        // 클라이언트 잘못이 아니다. finalizeConfirmation을 못 부르므로 이 세션은 confirmationId만
        // 설정된 채 남아, 같은 confirmation_id 재시도가 다시 여기로 와 또 503을 준다(재시도
        // 가능한 상태로 남김 — 관찰이 생기지 않았으므로 무결성은 깨지지 않는다).
        return reply
          .code(503)
          .send(audioError("audio_processor_unavailable", "종 정보를 찾을 수 없습니다.", { retryable: true }));
      }

      const recorded = await app.flow.recordIdentification(ctx, {
        taxon,
        rank: taxon.rank,
        confidence: chosen.confidence,
        source: app.config.audio.model.name,
        media: [],
        modality: "audio",
        now: new Date(),
      });

      const observationId = asObservationId(recorded.observationId);
      const confirmResult = {
        observationId,
        speciesId: chosen.speciesId,
        dexUpdated: Boolean(recorded.newlyUnlockedTaxonId),
        reward: { xp: recorded.xpGained, questIds: recorded.completedQuestIds },
      };
      await app.repos.audioSightings.finalizeConfirmation(sighting.id, {
        observationId,
        result: confirmResult,
      });

      return reply.code(200).send(audioConfirmResultToResponse(confirmResult));
    },
  );

  server.post<{ Body: SimilarityScoreBody }>(
    "/audio/similarity/score",
    { preHandler: authenticate, schema: { body: similarityScoreBodySchema } },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      if (request.body.mode !== "ambient") {
        return reply
          .code(400)
          .send(audioError("audio_invalid_format", "mode는 'ambient'여야 합니다(MVP 고정값)."));
      }

      const sighting = await app.repos.audioSightings.get(asAudioSightingId(request.body.audio_sighting_id));
      // STATE_MACHINE.md: score는 quality_checked(ready) 이상, confirmed/rejected/만료/소유권
      // 실패는 전부 이 endpoint에서도 불허 — identify와 정확히 같은 게이트를 쓴다(score는
      // confirm과 달리 재생/충돌 개념이 없어 "confirmed도 여기선 그냥 404"가 맞다 — 이미
      // 확정된 세션을 다시 채점해도 의미가 없고 계약에 별도 규칙도 없음).
      const expired = sighting ? new Date(sighting.expiresAt).getTime() <= Date.now() : false;
      if (!sighting || sighting.userId !== ctx.userId || expired || sighting.status !== "ready") {
        return reply.code(404).send(audioError("not_found", "오디오 세션을 찾을 수 없습니다."));
      }

      const taxon = await app.repos.taxa.get(asTaxonId(request.body.species_id));
      if (!taxon) {
        return reply
          .code(400)
          .send(audioError("invalid_species_id", "존재하지 않는 종입니다."));
      }

      const wavBytes = sighting.storagePath ? await app.audioTempStore.read(sighting.storagePath) : null;
      if (!wavBytes) {
        return reply
          .code(503)
          .send(audioError("audio_processor_unavailable", "오디오 파일을 읽을 수 없습니다.", { retryable: true }));
      }

      try {
        const outcome = await app.similarity.score({
          wavBytes,
          taxonId: taxon.id,
          quality: {
            snrDb: sighting.quality.snrDb,
            activeDurationMs: sighting.quality.activeDurationMs,
            durationMs: sighting.quality.durationMs,
          },
        });
        if (!outcome.supported) {
          return reply
            .code(422)
            .send(
              audioError(
                "similarity_not_supported_for_species",
                "이 종은 아직 비교할 참조 소리가 충분하지 않아요.",
                { retryable: false },
              ),
            );
        }
        return reply
          .code(200)
          .send(audioSimilarityScoreToResponse(sighting.id, taxon.id, outcome));
      } catch {
        // doc03 "모델 오류는 5xx로 반환" — identify와 동일한 원칙(삼키지 않고 503).
        return reply
          .code(503)
          .send(audioError("audio_processor_unavailable", "유사도 모델 서비스에 연결할 수 없습니다.", { retryable: true }));
      }
    },
  );

  server.get<{ Params: { speciesId: string } }>(
    "/species/:speciesId/sounds",
    { preHandler: authenticate },
    async (request, reply) => {
      // API_CONTRACT.md "Common rules": "All endpoints require the existing authenticated
      // user session" — 사진 파이프라인의 공개 /species/:id/card와 다르게 이 엔드포인트는
      // (오디오 계약 소속이라) 인증을 요구한다.
      const taxonId = asTaxonId(request.params.speciesId);
      const taxon = await app.repos.taxa.get(taxonId);
      if (!taxon) {
        return reply.code(404).send({ error: "not_found", message: "해당 종을 찾을 수 없습니다." });
      }
      const refs = await app.repos.speciesSoundReferences.listApproved(taxonId);
      return speciesSoundsToResponse(taxon.id, refs, (ref) => {
        const mt = signMediaToken(ref.id, jwtSecret);
        return `/audio/reference/${ref.id}?mt=${mt}`;
      });
    },
  );

  // 참조 음원 실제 바이트 재생 — mediaToken.ts와 같은 패턴(S3 presigned URL 방식): 발급
  // 시점(위 /species/:id/sounds, 인증 필요)에서 소유권이 아니라 "공개 라이선스 콘텐츠
  // 열람 허용"을 확인하고, 여기서는 로그인 여부를 다시 묻지 않고 서명·만료만 확인한다.
  server.get<{ Params: { refId: string }; Querystring: { mt?: string } }>(
    "/audio/reference/:refId",
    async (request, reply) => {
      const { refId } = request.params;
      const mt = request.query.mt;
      if (!mt || !verifyMediaToken(mt, refId, jwtSecret)) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      const ref = await app.repos.speciesSoundReferences.get(refId);
      if (!ref || ref.qualityStatus !== "approved") {
        return reply.code(404).send({ error: "not_found" });
      }
      const bytes = await app.referenceMediaStore.read(ref.mediaRef);
      if (!bytes) {
        return reply.code(404).send({ error: "not_found" });
      }
      reply.header("Content-Type", "audio/wav");
      return reply.send(bytes);
    },
  );

  // 9단계: 운영 모니터링 전용(계약 문서 소속 엔드포인트 아님) — 인증 불필요, CAMP-3의
  // /health·/ready와 같은 관례(로컬호스트/내부망에서만 접근한다는 전제).
  server.get("/audio/health", async (_request, reply) => {
    const report = await checkAudioHealth({
      modelEndpoint: app.config.audio.model.endpoint,
      modelTimeoutMs: app.config.audio.model.timeoutMs,
      expectedModelVersion: app.config.audio.model.expectedVersion,
      references: app.repos.speciesSoundReferences,
    });
    return reply.code(report.ready ? 200 : 503).send({
      ready: report.ready,
      model: {
        configured: report.model.configured,
        reachable: report.model.reachable,
        expected_version: report.model.expectedVersion,
      },
      reference_embeddings: {
        ready: report.referenceEmbeddings.ready,
        approved_clip_count: report.referenceEmbeddings.approvedClipCount,
      },
    });
  });
}

/** confirmationId가 이미 설정된 세션에 대한 응답 분기 — 처음 게이트에서든(이미 confirmed),
 * 클레임 경합에서 졌을 때든 같은 판단 로직을 재사용한다. */
function respondForClaimedSighting(
  sighting: AudioSighting,
  requestedConfirmationId: string,
  reply: FastifyReply,
) {
  if (sighting.confirmationId !== requestedConfirmationId) {
    // API_CONTRACT.md §3: "409 already_confirmed는 다른 confirmation_id가 이미 확정된
    // 세션을 확정하려 할 때만 쓴다."
    return reply.code(409).send({
      error: "already_confirmed",
      message: "이미 다른 요청으로 확정된 세션입니다.",
      retryable: false,
      trace_id: `trace_${randomUUID()}`,
    });
  }
  if (sighting.confirmResult) {
    // 같은 confirmation_id — 관찰/보상을 다시 만들지 않고 원본 성공 응답을 그대로 재생한다.
    return reply.code(200).send(audioConfirmResultToResponse(sighting.confirmResult));
  }
  // 클레임은 됐지만(confirmationId 설정) 아직 finalize 전 — 다른 요청이 지금 막 처리 중이거나
  // 이전 시도가 도중에 실패해 멈춘 상태. 관찰이 생겼는지 알 수 없으므로 재시도를 유도한다.
  return reply
    .code(503)
    .send(audioError("audio_processor_unavailable", "확정 처리 중입니다. 잠시 후 다시 시도하세요.", { retryable: true }));
}
