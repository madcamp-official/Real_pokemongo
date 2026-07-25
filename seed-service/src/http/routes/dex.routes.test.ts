import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { buildHttpServer } from "../server.js";
import { SEED_TAXA } from "../../seed/seedData.js";

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

async function signupAndGetToken(server: Awaited<ReturnType<typeof testServer>>["server"]) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: `${randomUUID()}@b.com`, password: "pw12345", nickname: "A", avatar: "fox", privacy: true, location: true, photo: true, consent_version: "v1" },
  });
  return res.json().access_token as string;
}

test("GET /dex: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/dex" });
  assert.equal(res.statusCode, 401);
});

test("GET /dex: 시드 종 전체가 discovered=false로 나온다(관찰 전)", async () => {
  const { server } = await testServer();
  const token = await signupAndGetToken(server);
  const res = await server.inject({
    method: "GET",
    url: "/dex",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const entries = res.json();
  assert.equal(entries.length, SEED_TAXA.length);
  assert.ok(entries.every((e: { discovered: boolean; name: string }) => e.discovered === false && e.name === "???"));
});

test("GET /dex: 계정 삭제 후에는 같은 토큰(서명은 여전히 유효)도 401", async () => {
  const { app, server } = await testServer();
  const token = await signupAndGetToken(server);

  await server.inject({ method: "DELETE", url: "/account", headers: { authorization: `Bearer ${token}` } });

  // authenticate preHandler가 User 존재 여부까지 확인하므로, 서명만 유효한 옛 토큰으로는
  // 라우트가 requireAuthContext()만 부르는(자체적으로 requireUser를 호출하지 않는) 이
  // GET /dex 같은 곳에서도 여전히 막힌다 — 라우트별 판단에 기대지 않는다는 게 이 설계의 요점.
  const res = await server.inject({
    method: "GET",
    url: "/dex",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 401);
});

test("GET /dex/completion: 관찰 전에는 0%", async () => {
  const { server } = await testServer();
  const token = await signupAndGetToken(server);
  const res = await server.inject({
    method: "GET",
    url: "/dex/completion",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.discovered, 0);
  assert.equal(body.total, SEED_TAXA.length);
  assert.equal(body.percentage, 0);
});

test("GET /species/:id/card: 인증 불필요, 존재하는 종은 200", async () => {
  const { server } = await testServer();
  const taxon = SEED_TAXA[0]!;
  const res = await server.inject({ method: "GET", url: `/species/${taxon.id}/card` });
  assert.equal(res.statusCode, 200);
  const card = res.json();
  assert.equal(card.species_id, taxon.id);
  assert.equal(card.scientific_name, taxon.sciName);
});

test("GET /species/:id/card: 존재하지 않는 종은 404", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/species/no-such-taxon/card" });
  assert.equal(res.statusCode, 404);
});
