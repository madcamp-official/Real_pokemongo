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
  cfg.mediaStorage.localDir = join(tmpdir(), `seed-service-test-${randomUUID()}`);
  cfg.auth.jwtSecret = "test-secret-not-for-production";
  return cfg;
}

async function testServer() {
  const app = await buildApp(testConfig());
  const server = await buildHttpServer(app);
  return { app, server };
}

async function signup(server: Awaited<ReturnType<typeof testServer>>["server"]) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: `${randomUUID()}@b.com`, password: "pw12345", nickname: "A", avatar: "fox", privacy: true, location: true, photo: true, consent_version: "v1" },
  });
  const body = res.json();
  return { token: body.access_token as string, userId: body.user.user_id as string };
}

test("GET /account/restore-bundle: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/account/restore-bundle" });
  assert.equal(res.statusCode, 401);
});

test("GET /account/restore-bundle: dex_count와 garden_layout_present=false", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const res = await server.inject({
    method: "GET",
    url: "/account/restore-bundle",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.dex_count, 0);
  assert.equal(body.garden_layout_present, false, "홈가든 도메인이 없으므로 항상 false");
});

test("DELETE /account: 삭제 후 재호출은 401(계정이 더 이상 없음)", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signup(server);

  const del = await server.inject({
    method: "DELETE",
    url: "/account",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(del.statusCode, 200);
  assert.equal(await app.repos.users.get(userId as never), null, "계정이 실제로 삭제돼야 함");

  // 같은 토큰(서명 자체는 여전히 유효)으로 재호출 → authenticate preHandler가 User
  // 존재 여부까지 확인해 401로 거부한다(핸들러까지 도달하지 않음 — createAuthenticate
  // 주석 참고: 계정 삭제 후 이전 토큰이 계속 통하는 걸 라우트별 판단에 맡기지 않기 위함).
  const again = await server.inject({
    method: "DELETE",
    url: "/account",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(again.statusCode, 401);
});

test("GET /account/privacy-settings: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/account/privacy-settings" });
  assert.equal(res.statusCode, 401);
});

test("GET /account/privacy-settings: 가입 시 넘긴 동의값을 그대로 돌려준다", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      email: `${randomUUID()}@b.com`,
      password: "pw12345",
      nickname: "A",
      avatar: "fox",
      privacy: true,
      location: false,
      photo: true,
      consent_version: "v1",
    },
  });
  const token = res.json().access_token as string;

  const get = await server.inject({
    method: "GET",
    url: "/account/privacy-settings",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(get.statusCode, 200);
  assert.deepEqual(get.json(), { location: false, photo: true });
});

test("GET /account/privacy-settings: 동의 기록이 아예 없는 게스트는 photo 기본값 true", async () => {
  const { server } = await testServer();
  const guest = await server.inject({ method: "POST", url: "/session/guest" });
  const token = guest.json().access_token as string;

  const get = await server.inject({
    method: "GET",
    url: "/account/privacy-settings",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(get.statusCode, 200);
  assert.deepEqual(get.json(), { location: false, photo: true });
});

test("PATCH /account/privacy-settings: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "PATCH",
    url: "/account/privacy-settings",
    payload: { location: true, photo: false },
  });
  assert.equal(res.statusCode, 401);
});

test("PATCH /account/privacy-settings: 토글이 실제로 User.locationStorageEnabled와 ConsentRecord.photo에 반영된다", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signup(server);

  const patch = await server.inject({
    method: "PATCH",
    url: "/account/privacy-settings",
    headers: { authorization: `Bearer ${token}` },
    payload: { location: false, photo: false },
  });
  assert.equal(patch.statusCode, 200);
  assert.deepEqual(patch.json(), { location: false, photo: false });

  // 응답만 맞고 실제 저장소는 안 바뀌는 "가짜 성공"을 막기 위해 리포지토리를 직접 확인한다.
  const user = await app.repos.users.get(userId as never);
  assert.equal(user?.locationStorageEnabled, false, "지도(F11) 등이 참조하는 실제 필드가 바뀌어야 함");

  const consent = await app.repos.consent.getByUser(userId as never);
  assert.equal(consent?.photo, false, "재학습 샘플 저장 여부를 가르는 실제 필드가 바뀌어야 함");
  assert.equal(consent?.privacy, true, "토글 화면엔 없는 privacy는 기존 값을 그대로 유지해야 함");

  // 다시 GET하면 방금 PATCH한 값이 그대로 조회돼야 한다(왕복 검증).
  const get = await server.inject({
    method: "GET",
    url: "/account/privacy-settings",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.deepEqual(get.json(), { location: false, photo: false });
});

test("PATCH /account/privacy-settings: 동의 기록이 없던 게스트도 최초 PATCH로 정상 생성된다", async () => {
  const { app, server } = await testServer();
  const guest = await server.inject({ method: "POST", url: "/session/guest" });
  const token = guest.json().access_token as string;
  const userId = guest.json().user.user_id as string;

  const patch = await server.inject({
    method: "PATCH",
    url: "/account/privacy-settings",
    headers: { authorization: `Bearer ${token}` },
    payload: { location: true, photo: false },
  });
  assert.equal(patch.statusCode, 200);

  const consent = await app.repos.consent.getByUser(userId as never);
  assert.equal(consent?.location, true);
  assert.equal(consent?.photo, false);
  assert.equal(consent?.privacy, true, "동의 기록이 전혀 없던 경우엔 privacy를 true로 새로 세운다");
});

test("PATCH /account/privacy-settings: 다른 사용자의 설정에는 영향을 주지 않는다", async () => {
  const { app, server } = await testServer();
  const userA = await signup(server);
  const userB = await signup(server);

  await server.inject({
    method: "PATCH",
    url: "/account/privacy-settings",
    headers: { authorization: `Bearer ${userA.token}` },
    payload: { location: false, photo: false },
  });

  const userBRecord = await app.repos.users.get(userB.userId as never);
  assert.equal(userBRecord?.locationStorageEnabled, true, "B 계정은 가입 시 값(true)이 그대로여야 함");
});
