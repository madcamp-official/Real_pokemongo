/**
 * F1 온보딩 & 인증 라우트. `POST /auth/signup`만 비인증, 나머지는 방금 발급한 토큰 필요.
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, hashPassword, type AuthenticateHandler } from "../auth.js";
import { buildSignupResponse } from "../mappers.js";

interface SignupBody {
  email: string;
  password: string;
  nickname: string;
  avatar: string;
}
const signupBodySchema = {
  type: "object",
  required: ["email", "password", "nickname", "avatar"],
  properties: {
    email: { type: "string", minLength: 3 },
    password: { type: "string", minLength: 1 },
    nickname: { type: "string", minLength: 1 },
    avatar: { type: "string", minLength: 1 },
  },
} as const;

interface ConsentBody {
  privacy: boolean;
  location: boolean;
  photo: boolean;
  consent_version: string;
}
const consentBodySchema = {
  type: "object",
  required: ["privacy", "location", "photo", "consent_version"],
  properties: {
    privacy: { type: "boolean" },
    location: { type: "boolean" },
    photo: { type: "boolean" },
    consent_version: { type: "string", minLength: 1 },
  },
} as const;

export function registerAuthRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.post<{ Body: SignupBody }>(
    "/auth/signup",
    { schema: { body: signupBodySchema } },
    async (request, reply) => {
      const { email, password, nickname, avatar } = request.body;

      // 이메일 중복 가입 방지(로그인 엔드포인트가 없는 지금 범위에서도, 같은 이메일로
      // 계정이 여러 개 생기는 건 명백한 버그이므로 막는다).
      const existing = await app.repos.credentials.findByEmail(email);
      if (existing) {
        return reply.code(409).send({ error: "email_taken", message: "이미 가입된 이메일입니다." });
      }

      const user = await app.accounts.createUser({ nickname, avatar });
      const passwordHash = await hashPassword(password);
      await app.repos.credentials.save({ userId: user.id, email, passwordHash });

      const accessToken = await reply.jwtSign({ sub: user.id });
      return buildSignupResponse(accessToken, user, email);
    },
  );

  server.post<{ Body: ConsentBody }>(
    "/auth/consent",
    { preHandler: authenticate, schema: { body: consentBodySchema } },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const { privacy, location, photo, consent_version } = request.body;

      // location 동의는 기존 AccountService.setLocationStorage()를 그대로 재사용
      // (프라이버시 기본값/본인 계정만 조작 가능 원칙이 이미 거기 있음 — 중복 구현하지 않음).
      await app.accounts.setLocationStorage(ctx, location);
      await app.repos.consent.save({
        userId: ctx.userId,
        privacy,
        location,
        photo,
        consentVersion: consent_version,
        agreedAt: new Date().toISOString(),
      });

      return reply.code(200).send({});
    },
  );

  server.post(
    "/session/guest/convert",
    { preHandler: authenticate },
    async (request, reply) => {
      requireAuthContext(request); // 인증 여부만 확인(로그로 안 남는 no-op이 아님을 보장)
      // 게스트 사진은 애초에 서버로 업로드된 적이 없다(app/의 uploadSighting()은 인증
      // 여부와 무관하게 항상 같은 엔드포인트를 쓰고, 게스트 모드는 로컬에만 저장 — 프론트
      // 코드 확인 완료). 서버가 마이그레이션할 데이터가 실제로 없으므로 0을 정직하게 반환.
      return reply.code(200).send({ migrated_sightings: 0 });
    },
  );
}
