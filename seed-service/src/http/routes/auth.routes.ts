/**
 * F1 온보딩 & 인증 라우트. `POST /auth/signup`, `POST /auth/login`만 비인증, 나머지는
 * 방금 발급한 토큰 필요.
 *
 * 동의(consent)는 회원가입 요청에 함께 담아 한 번에 처리한다(계정이 생기기 전에는
 * 인증 토큰이 없어 별도 `/auth/consent` 호출이 애초에 불가능했다 — 프론트엔드가
 * "계정 생성 전에 동의부터 받는다"는 순서로 온보딩을 설계했으므로, 그 순서에 맞춰
 * 백엔드도 가입 시점에 동의를 함께 수집하도록 맞췄다. 이전엔 가입 후 별도
 * `POST /auth/consent`를 호출하는 2단계였으나, 그 엔드포인트를 호출하는 유일한
 * 프론트엔드 코드가 사라져 지금은 쓰이지 않으므로 제거했다).
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, hashPassword, verifyPassword, type AuthenticateHandler } from "../auth.js";
import { buildSignupResponse } from "../mappers.js";

interface SignupBody {
  email: string;
  password: string;
  nickname: string;
  avatar: string;
  privacy: boolean;
  location: boolean;
  photo: boolean;
  consent_version: string;
}
const signupBodySchema = {
  type: "object",
  required: [
    "email",
    "password",
    "nickname",
    "avatar",
    "privacy",
    "location",
    "photo",
    "consent_version",
  ],
  properties: {
    email: { type: "string", minLength: 3 },
    password: { type: "string", minLength: 1 },
    nickname: { type: "string", minLength: 1 },
    avatar: { type: "string", minLength: 1 },
    privacy: { type: "boolean" },
    location: { type: "boolean" },
    photo: { type: "boolean" },
    consent_version: { type: "string", minLength: 1 },
  },
} as const;

interface LoginBody {
  email: string;
  password: string;
}
const loginBodySchema = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", minLength: 3 },
    password: { type: "string", minLength: 1 },
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
      const { email, password, nickname, avatar, privacy, location, photo, consent_version } =
        request.body;

      // 이메일 중복 가입 방지(로그인 엔드포인트가 없는 지금 범위에서도, 같은 이메일로
      // 계정이 여러 개 생기는 건 명백한 버그이므로 막는다).
      const existing = await app.repos.credentials.findByEmail(email);
      if (existing) {
        return reply.code(409).send({ error: "email_taken", message: "이미 가입된 이메일입니다." });
      }

      const user = await app.accounts.createUser({ nickname, avatar });
      const passwordHash = await hashPassword(password);
      await app.repos.credentials.save({ userId: user.id, email, passwordHash });

      // 동의는 계정과 동시에 생성된다(프론트가 계정 생성 전에 동의부터 받으므로, 그
      // 시점엔 인증 토큰이 없어 별도 호출이 불가능했다 — 위 파일 헤더 주석 참고).
      // location 동의는 기존 AccountService.setLocationStorage()를 그대로 재사용
      // (프라이버시 기본값/본인 계정만 조작 가능 원칙이 이미 거기 있음 — 중복 구현하지 않음).
      const ctx = { userId: user.id };
      await app.accounts.setLocationStorage(ctx, location);
      await app.repos.consent.save({
        userId: user.id,
        privacy,
        location,
        photo,
        consentVersion: consent_version,
        agreedAt: new Date().toISOString(),
      });

      const accessToken = await reply.jwtSign({ sub: user.id });
      return buildSignupResponse(accessToken, user, email);
    },
  );

  server.post<{ Body: LoginBody }>(
    "/auth/login",
    { schema: { body: loginBodySchema } },
    async (request, reply) => {
      const { email, password } = request.body;

      // 이메일 존재 여부와 비밀번호 오류를 구분해서 응답하지 않는다 — 둘 중 하나만 다르게
      // 응답하면 공격자가 가입된 이메일 목록을 무차별로 추려낼 수 있다(계정 존재 여부 노출).
      const invalidCredentials = () =>
        reply
          .code(401)
          .send({ error: "invalid_credentials", message: "이메일 또는 비밀번호가 올바르지 않습니다." });

      const credential = await app.repos.credentials.findByEmail(email);
      if (!credential) return invalidCredentials();

      const passwordOk = await verifyPassword(password, credential.passwordHash);
      if (!passwordOk) return invalidCredentials();

      const user = await app.repos.users.get(credential.userId);
      if (!user) return invalidCredentials();

      const accessToken = await reply.jwtSign({ sub: user.id });
      return buildSignupResponse(accessToken, user, email);
    },
  );

  // 게스트도 서버 세션(토큰)을 갖는다. 토큰 없이는 /dex·/map/pins·/sightings/upload가
  // 전부 401이라 게스트 모드에서 앱이 아무것도 못 한다 — 아래 /session/guest/convert가
  // `preHandler: authenticate`인 것도 "게스트는 이미 토큰을 들고 있다"는 전제였다.
  // 자격증명(이메일/비밀번호)은 저장하지 않으므로 이 계정은 이 토큰으로만 접근 가능하고,
  // 나중에 /auth/signup으로 정식 전환한다.
  server.post("/session/guest", async (request, reply) => {
    const user = await app.accounts.createUser({ nickname: "탐험가", avatar: "fox" });
    const accessToken = await reply.jwtSign({ sub: user.id });
    return buildSignupResponse(accessToken, user, "");
  });

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
