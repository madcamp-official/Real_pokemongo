/**
 * F2 촬영 업로드 + F4 AI 동정 라우트(2단계: 동정만 하는 /identify 와, 실제 기록까지
 * 하는 /identify/confirm 으로 나뉜다 — 설계 근거는 ObservationFlow.ts 상단 주석 참고).
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { outcomeToIdentifyResponse } from "../mappers.js";
import { asSightingId } from "../../core/domain/ids.js";
import { sanitizeImages } from "../../core/media/MediaSanitizer.js";
import { enhanceImages } from "../../core/media/ImageEnhancer.js";
import type { RawCoordinate } from "../../core/observation/regionGeneralizer.js";

interface IdentifyBody {
  sighting_id: string;
}
const identifyBodySchema = {
  type: "object",
  required: ["sighting_id"],
  properties: { sighting_id: { type: "string", minLength: 1 } },
} as const;

interface ConfirmBody {
  sighting_id: string;
  species_id: string;
}
const confirmBodySchema = {
  type: "object",
  required: ["sighting_id", "species_id"],
  properties: {
    sighting_id: { type: "string", minLength: 1 },
    species_id: { type: "string", minLength: 1 },
  },
} as const;

export function registerSightingsRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.post("/sightings/upload", { preHandler: authenticate }, async (request, reply) => {
    const ctx = requireAuthContext(request);

    const rawFrames: Buffer[] = [];
    let lat: number | undefined;
    let lng: number | undefined;

    for await (const part of request.parts()) {
      if (part.type === "file" && part.fieldname === "frames") {
        rawFrames.push(await part.toBuffer());
      } else if (part.type === "field" && part.fieldname === "lat") {
        lat = parseFloat(String(part.value));
      } else if (part.type === "field" && part.fieldname === "lng") {
        lng = parseFloat(String(part.value));
      }
    }

    if (rawFrames.length === 0) {
      return reply.code(400).send({ error: "no_frames", message: "최소 1장의 사진이 필요합니다." });
    }

    // 미지 포맷이면 sanitizeImages()가 UnsupportedImageFormatError를 던진다 — 여기서
    // 잡지 않고 그대로 흘려보내면 server.ts의 전역 에러 핸들러가 400으로 매핑한다.
    const sanitized = sanitizeImages(rawFrames.map((b) => new Uint8Array(b)));

    const rawCoord: RawCoordinate | undefined =
      lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : undefined;

    // F3 사진 보정 — 여러 프레임(버스트)을 병합·화질 보정해 대표 이미지 1장을 만든다.
    // 실패해도 절대 throw하지 않는다(ImageEnhancer.ts 상단 주석) — 업로드 자체는 항상 성공해야 함.
    const { image: enhanced, report: enhancement } = await enhanceImages(sanitized.images);

    // 실기기 테스트 관찰용 — 프론트에 아직 UI가 없어 콘솔로 확인한다. 값 자체가
    // 민감정보가 아니라(품질 지표일 뿐) 상시 남겨둬도 무방한 수준의 로그.
    console.log(
      `[F3] frames=${enhancement.framesUsed} merge=${enhancement.mergeStrategy} ` +
        `blur=${enhancement.blurScore.toFixed(2)} exposure=${enhancement.exposureScore.toFixed(2)} ` +
        `confidence=${enhancement.confidence.toFixed(2)} retake_suggested=${enhancement.retakeSuggested}`,
    );

    const sighting = app.pendingSightings.create(
      ctx.userId,
      sanitized.images,
      enhanced,
      enhancement,
      rawCoord,
    );

    // F3 "재학습용 데이터 수집" — 보정기가 저품질로 판단했고(가장 개선에 쓸모 있는 표본),
    // 사용자가 사진 관련 동의를 한 경우에만 원본을 별도 보관한다. 저장 실패가 업로드
    // 응답을 막으면 안 되므로 실패는 조용히 무시한다(부가 기능, 핵심 경로 아님).
    if (enhancement.retakeSuggested) {
      try {
        const consent = await app.repos.consent.getByUser(ctx.userId);
        if (consent?.photo) {
          await Promise.all(
            sanitized.images.map((img) => app.mediaStore.saveTrainingSample(img, "retake_suggested")),
          );
        }
      } catch {
        // 재학습 데이터 수집은 부가 기능 — 실패해도 업로드 자체는 성공으로 응답한다.
      }
    }

    // 목업(mockAdapter.ts)과 동일한 값: 이 호출 안에서 정화까지는 실제로 끝나므로 'done'.
    // retake_suggested는 하위호환 추가 필드(app/src/types/api.ts의 기존 계약을 깨지 않음).
    return {
      sighting_id: sighting.id,
      status: "done" as const,
      retake_suggested: enhancement.retakeSuggested,
    };
  });

  server.post<{ Body: IdentifyBody }>(
    "/identify",
    { preHandler: authenticate, schema: { body: identifyBodySchema } },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const sighting = app.pendingSightings.get(asSightingId(request.body.sighting_id));

      // 미존재/남의 sighting을 같은 404로 처리 — Authorization.ts와 동일한 "존재 여부
      // 누설 방지" 원칙(체크리스트 §1.3)을 여기서도 지킨다.
      if (!sighting || sighting.userId !== ctx.userId) {
        return reply.code(404).send({ error: "not_found" });
      }

      // IdentificationGateway.identify()는 순수 함수(부수효과 없음) — 도감/퀘스트/보상은
      // 절대 여기서 건드리지 않는다. 결과는 sighting에 매달아 /identify/confirm이 재사용.
      // F3 보정본(enhanced)을 넘긴다 — 원본 프레임이 아니라 병합·화질보정을 거친 대표
      // 이미지 1장(버스트도 이미 여기서 합쳐졌음)이라 BioCLIP 등 프로바이더 정확도에 유리하다.
      const outcome = await app.gateway.identify({ images: [sighting.enhanced] });
      app.pendingSightings.attachIdentification(sighting.id, outcome);

      return outcomeToIdentifyResponse(outcome);
    },
  );

  server.post<{ Body: ConfirmBody }>(
    "/identify/confirm",
    { preHandler: authenticate, schema: { body: confirmBodySchema } },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const sighting = app.pendingSightings.get(asSightingId(request.body.sighting_id));

      if (!sighting || sighting.userId !== ctx.userId) {
        return reply.code(404).send({ error: "not_found" });
      }
      if (!sighting.identification) {
        return reply
          .code(400)
          .send({ error: "not_identified_yet", message: "먼저 /identify를 호출하세요." });
      }

      // 사용자가 고른 species_id가 방금 계산해둔 후보 안에 실제로 있는지 검증 —
      // 후보에 없는 종을 억지로 도감에 우겨넣는 걸 막는다(요청 위조 방지).
      const chosen = sighting.identification.candidates.find(
        (c) => c.taxon?.id === request.body.species_id,
      );
      if (!chosen || !chosen.taxon) {
        return reply
          .code(400)
          .send({ error: "invalid_species_id", message: "동정 후보에 없는 종입니다." });
      }

      // F3 "원본 폐기" 정책: 확정 시 디스크에 남기는 건 보정본 1장뿐이다. 정화된 원본
      // 프레임(sighting.images)은 PendingSightingStore가 프로세스 메모리에만 들고 있다가
      // consume()으로 사라진다 — 애초에 디스크에 쓰인 적이 없으므로 "폐기"는 별도 삭제
      // 절차가 필요 없다(안 쓴 것 자체가 정책 구현).
      const media = [await app.mediaStore.save(sighting.enhanced)];

      await app.flow.recordIdentification(ctx, {
        taxon: chosen.taxon,
        rank: chosen.rank,
        confidence: chosen.confidence,
        source: sighting.identification.source,
        media,
        rawCoord: sighting.rawCoord,
      });

      app.pendingSightings.consume(sighting.id);
      return reply.code(200).send({});
    },
  );
}
