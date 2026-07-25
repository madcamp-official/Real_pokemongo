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
