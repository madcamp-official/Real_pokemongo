/**
 * F1 라우트 통합테스트. Fastify의 app.inject()로 실제 포트/네트워크 없이 검증한다
 * (자동화 테스트는 GPU/외부 API를 절대 타지 않는다는 계획의 전제와 일치).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { buildHttpServer } from "../server.js";

function testConfig() {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  // 테스트가 실제 저장소 디렉터리를 더럽히지 않도록 임시 디렉터리 사용.
  cfg.mediaStorage.localDir = join(tmpdir(), `seed-service-test-${randomUUID()}`);
  // 고정 시크릿 — 매 테스트마다 "임시 시크릿 생성" 경고가 반복 출력되는 걸 막는다
  // (개발용 자동 생성 로직 자체는 server.test.ts에서 별도로 검증).
  cfg.auth.jwtSecret = "test-secret-not-for-production";
  return cfg;
}

async function testServer() {
  const app = await buildApp(testConfig());
  const server = await buildHttpServer(app);
  return { app, server };
}

/** 회원가입 요청 기본 페이로드. 동의 필드는 D단계 이후 가입 시 함께 제출된다. */
function signupPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    email: "a@b.com",
    password: "pw12345",
    nickname: "탐험가",
    avatar: "fox",
    privacy: true,
    location: true,
    photo: false,
    consent_version: "v1",
    ...overrides,
  };
}

test("POST /auth/signup: 성공 시 access_token과 user를 반환한다", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: signupPayload({ email: "a@b.com", nickname: "탐험가" }),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.access_token);
  assert.equal(body.user.email, "a@b.com");
  assert.equal(body.user.nickname, "탐험가");
});

test("POST /auth/signup: 같은 이메일로 재가입은 409", async () => {
  const { server } = await testServer();
  const payload = signupPayload({ email: "dup@b.com" });
  const first = await server.inject({ method: "POST", url: "/auth/signup", payload });
  assert.equal(first.statusCode, 200);
  const second = await server.inject({ method: "POST", url: "/auth/signup", payload });
  assert.equal(second.statusCode, 409);
});

test("POST /auth/signup: 필드 누락은 400(스키마 검증)", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: "a@b.com" }, // password/nickname/avatar/동의 필드 전부 누락
  });
  assert.equal(res.statusCode, 400);
});

test("POST /auth/signup: 동의 필드만 빠져도 400(계정 생성 전 동의 필수)", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: "no-consent@b.com", password: "pw12345", nickname: "A", avatar: "fox" },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /auth/signup: 동의 정보가 가입과 함께 저장되고 location이 계정에 반영된다", async () => {
  const { app, server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: signupPayload({
      email: "c@b.com",
      privacy: true,
      location: true,
      photo: false,
      consent_version: "v1",
    }),
  });
  assert.equal(res.statusCode, 200);
  const { user } = res.json();

  const fresh = await app.repos.users.get(user.user_id);
  assert.equal(fresh!.locationStorageEnabled, true, "location:true가 계정에 반영돼야 함");

  const consentRecord = await app.repos.consent.getByUser(user.user_id);
  assert.equal(consentRecord!.photo, false);
  assert.equal(consentRecord!.consentVersion, "v1");
});

test("POST /auth/login: 올바른 이메일/비밀번호면 access_token과 user를 반환한다", async () => {
  const { server } = await testServer();
  await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: signupPayload({ email: "login-ok@b.com", password: "pw12345", nickname: "탐험가" }),
  });

  const res = await server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "login-ok@b.com", password: "pw12345" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.access_token);
  assert.equal(body.user.email, "login-ok@b.com");
  assert.equal(body.user.nickname, "탐험가");
});

test("POST /auth/login: 비밀번호가 틀리면 401", async () => {
  const { server } = await testServer();
  await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: signupPayload({ email: "login-wrongpw@b.com", password: "correct-pw" }),
  });

  const res = await server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "login-wrongpw@b.com", password: "wrong-pw" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "invalid_credentials");
});

test("POST /auth/login: 가입되지 않은 이메일이면 401(존재 여부 노출 안 함)", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "never-signed-up@b.com", password: "whatever1" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "invalid_credentials");
});

test("POST /auth/login: 필드 누락은 400(스키마 검증)", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "a@b.com" },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /session/guest/convert: 인증 있으면 migrated_sightings=0을 정직하게 반환", async () => {
  const { server } = await testServer();
  const signup = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: signupPayload({ email: "g@b.com" }),
  });
  const { access_token } = signup.json();

  const res = await server.inject({
    method: "POST",
    url: "/session/guest/convert",
    headers: { authorization: `Bearer ${access_token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { migrated_sightings: 0 });
});
