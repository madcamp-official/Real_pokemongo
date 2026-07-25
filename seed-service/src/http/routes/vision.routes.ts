/**
 * F19 터치 기반 사전 위험 경고 라우트.
 *
 * 카메라 프리뷰에서 터치한 지점 주변을 크롭한 저해상도 이미지를 받아, F4(정밀 동정)와
 * 같은 게이트웨이로 잠정 추정치만 돌려준다. F4와의 핵심 차이 — 이 라우트는:
 *   1) 인증 불필요(공개). 게스트도 위험 경고는 받아야 한다는 게 제품 결정이고, 아래
 *      "부수효과 없음" 특성상 IDOR/개인정보 우려가 없다.
 *   2) PendingSighting/Observation/Creature 등 **어떤 상태도 만들지 않는다** — 순수
 *      조회성 호출. 도감 자동 등록 트리거는 여전히 /identify/confirm 만의 몫이다.
 * 인증 없는 엔드포인트가 GPU 동정 파이프라인을 직접 태우므로, 남용 방지를 위해 이
 * 라우트에만 스코프한 IP 기준 rate-limit을 건다(다른 라우트는 영향받지 않음).
 */
import type { FastifyInstance } from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import type { App } from "../../composition.js";
import { sanitizeImages } from "../../core/media/MediaSanitizer.js";
import { buildPreviewScanResponse } from "../mappers.js";

interface PreviewScanBody {
  x: number;
  y: number;
  image: string;
}

const previewScanBodySchema = {
  type: "object",
  required: ["x", "y", "image"],
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
    // 크롭된 저해상도(160px) JPEG의 base64. 빈 문자열은 애초에 이미지가 아니므로 거부.
    image: { type: "string", minLength: 1 },
  },
} as const;

/** IP당 분당 허용 호출 수. 정상 사용(손가락으로 몇 초에 한 번 터치)엔 넉넉하고,
 * 스크립트성 남용(같은 GPU를 태우는 /identify와 자원을 공유)은 빠르게 막는다. */
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = "1 minute";

/**
 * @fastify/rate-limit은 errorResponseBuilder의 반환값을 그대로 throw한다(플러그인 내부
 * 구현) — 일반 객체를 반환하면 server.ts의 전역 에러 핸들러가 인식 못 해 500으로 새버린다
 * (실제로 겪은 버그). AuthorizationError/UnsupportedImageFormatError와 동일하게 전용
 * 에러 클래스를 던지고, 전역 핸들러가 그걸 보고 429로 매핑하게 한다.
 */
export class RateLimitedError extends Error {
  constructor() {
    super("너무 많이 시도했어요. 잠시 후 다시 시도해 주세요.");
    this.name = "RateLimitedError";
  }
}

export function registerVisionRoutes(server: FastifyInstance, app: App): void {
  // 이 컨텍스트 안에서만 rate-limit이 적용되도록 캡슐화한다 — 다른(인증된) 라우트들은
  // 이미 계정당 한도(freeDailyLimit 등)로 별도 보호되고 있어 여기서 건드리지 않는다.
  server.register(async (scoped) => {
    await scoped.register(fastifyRateLimit, {
      max: RATE_LIMIT_MAX,
      timeWindow: RATE_LIMIT_WINDOW,
      errorResponseBuilder: () => new RateLimitedError(),
    });

    scoped.post<{ Body: PreviewScanBody }>(
      "/vision/preview-scan",
      { schema: { body: previewScanBodySchema } },
      async (request) => {
        // 미지 포맷/손상 이미지면 sanitizeImages가 UnsupportedImageFormatError를 던진다 —
        // sightings.routes.ts와 동일하게 여기서 잡지 않고 전역 에러 핸들러(server.ts)가
        // 400으로 매핑하게 둔다.
        const raw = Buffer.from(request.body.image, "base64");
        const sanitized = sanitizeImages([new Uint8Array(raw)]);

        // IdentificationGateway.identify()는 순수 함수(부수효과 없음, IdentificationGateway.ts
        // 상단 주석 참고) — pendingSightings/observations/creatures 어디에도 손대지 않는다.
        const outcome = await app.gateway.identify({ images: sanitized.images });
        return buildPreviewScanResponse(outcome);
      },
    );
  });
}
