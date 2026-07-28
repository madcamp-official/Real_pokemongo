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
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { audioSightingToUploadResponse, audioIdentificationOutcomeToResponse } from "../mappers.js";
import { UnsupportedAudioFormatError } from "../../core/audio/AudioSignature.js";
import { AudioConversionError } from "../../core/audio/AudioConverter.js";
import { asAudioSightingId } from "../../core/domain/ids.js";

const identifyBodySchema = {
  type: "object",
  required: ["audio_sighting_id"],
  properties: { audio_sighting_id: { type: "string", minLength: 1 } },
} as const;
interface IdentifyBody {
  audio_sighting_id: string;
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
          modelProvider: "birdnet",
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
}
