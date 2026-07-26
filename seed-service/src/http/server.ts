/**
 * Fastify 서버 조립 (C단계). 플러그인 등록 + 라우트 4그룹 등록만 담당한다 — 실제 리스닝은
 * `src/serve.ts`(실행 진입점)의 몫으로 분리해서, 이 함수 자체는 통합테스트에서
 * `app.inject()`로 실제 포트 없이도 재사용할 수 있게 한다.
 */
import Fastify, { type FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import { randomBytes } from "node:crypto";
import type { App } from "../composition.js";
import { AuthorizationError } from "../core/auth/Authorization.js";
import { UnsupportedImageFormatError } from "../core/media/MediaSanitizer.js";
import { ClaimError } from "../core/rewards/RewardEngine.js";
import { createAuthenticate } from "./auth.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerSightingsRoutes } from "./routes/sightings.routes.js";
import { registerDexRoutes } from "./routes/dex.routes.js";
import { registerAccountRoutes } from "./routes/account.routes.js";
import { registerBadgeRoutes } from "./routes/badges.routes.js";
import { registerQuestRoutes } from "./routes/quests.routes.js";
import { registerCreatureRoutes } from "./routes/creatures.routes.js";
import { registerGardenRoutes } from "./routes/garden.routes.js";
import { registerVisionRoutes, RateLimitedError } from "./routes/vision.routes.js";
import { registerMapRoutes } from "./routes/map.routes.js";

/**
 * `config.auth.jwtSecret`이 비어있으면(개발 환경) 부팅 시 임의 시크릿을 생성한다.
 * 프로덕션에서는 `assertProductionConfig()`가 이미 부팅 전 단계에서 막지만, 이 함수는
 * 그 체크를 우회해서 직접 호출될 수도 있으므로 여기서도 한 번 더 방어한다(조용히 넘어가지
 * 않고 예외로 실패, 개발 환경은 경고만 찍고 계속 진행).
 */
function resolveJwtSecret(app: App): string {
  if (app.config.auth.jwtSecret) return app.config.auth.jwtSecret;

  if (app.config.nodeEnv === "production") {
    throw new Error("[http] AUTH_JWT_SECRET 미설정 — 프로덕션에서는 부팅할 수 없습니다.");
  }

  const generated = randomBytes(32).toString("hex");
  console.warn(
    "\n⚠️  [http] AUTH_JWT_SECRET이 설정되지 않아 이번 실행에서만 쓰는 임시 시크릿을 " +
      "생성했습니다.\n    서버를 재시작하면 시크릿도 바뀌어 기존에 발급된 토큰이 전부 " +
      "무효화됩니다.\n    .env에 AUTH_JWT_SECRET을 채우면 이 경고는 사라집니다.\n",
  );
  return generated;
}

export async function buildHttpServer(app: App): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  await server.register(fastifyJwt, { secret: resolveJwtSecret(app) });
  // limits.fileSize를 안 주면 Fastify 기본 bodyLimit(1MB)을 그대로 물려받는다 — 실제
  // 폰 카메라 사진(quality 0.7로 압축해도 보통 1MB 초과)이 전부 413으로 거부되는 걸
  // 실기기 테스트에서 발견했다. 버스트(최대 3장) 중 가장 큰 프레임도 넉넉히 통과하도록
  // 여유 있게 잡는다.
  await server.register(fastifyMultipart, {
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB/프레임
  });

  // 한 번만 생성해 모든 라우트 그룹에 동일한 preHandler를 건다 — 계정 존재 여부 확인을
  // 개별 라우트가 각자 판단하게 두지 않기 위함(auth.ts의 createAuthenticate 주석 참고).
  const authenticate = createAuthenticate(app.repos.users);

  registerAuthRoutes(server, app, authenticate);
  registerSightingsRoutes(server, app, authenticate);
  registerDexRoutes(server, app, authenticate);
  registerAccountRoutes(server, app, authenticate);
  registerBadgeRoutes(server, app, authenticate);
  registerQuestRoutes(server, app, authenticate);
  registerCreatureRoutes(server, app, authenticate);
  registerGardenRoutes(server, app, authenticate);
  registerVisionRoutes(server, app);
  registerMapRoutes(server, app, authenticate);

  // 전역 에러 매핑 — core/auth/Authorization.ts의 원칙("소유권 없음/미존재는 같은 404,
  // 자원 존재 여부를 누설하지 않는다")을 HTTP 계층에서도 그대로 지킨다. 이걸 안 걸면
  // AuthorizationError가 그대로 새어나가 500(서버 버그처럼 보임)이 돼버린다 — 실제로
  // 테스트 중에 발견해서 고친 부분.
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthorizationError) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (error instanceof UnsupportedImageFormatError) {
      return reply.code(400).send({ error: "invalid_image", message: error.message });
    }
    if (error instanceof RateLimitedError) {
      return reply.code(429).send({ error: "rate_limited", message: error.message });
    }
    if (error instanceof ClaimError) {
      // not_found는 존재 여부 누설 방지 원칙과 같은 이유로 404, 나머지(아직 조건 미충족/
      // 이미 수령함)는 "요청 자체는 이해했지만 지금 시점엔 처리 불가"인 400이 맞다.
      const status = error.reason === "not_found" ? 404 : 400;
      return reply.code(status).send({ error: error.reason });
    }
    // Fastify 자체 검증 에러(스키마 불일치 등)는 이미 올바른 statusCode를 갖고 있다.
    const err = error as Error & { statusCode?: number };
    if (typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    // logger:false라 request.log.error()는 원래 아무것도 안 찍는다(no-op) — 그래서 지금까지
    // 500이 나도 터미널에 흔적이 전혀 안 남았다(실기기 업로드 실패 원인 조사 중 발견).
    // 진단 가능하도록 최소한 콘솔에는 실제로 남긴다.
    console.error("[server] 처리되지 않은 에러:", error);
    return reply.code(500).send({ error: "internal_error" });
  });

  return server;
}
