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
  assert.ok(entries.every((e: { discovered: boolean }) => e.discovered === false));
});

test("GET /dex: 미해금 종도 이름은 실제 국명으로 보인다(???로 가려지지 않음)", async () => {
  const { server } = await testServer();
  const token = await signupAndGetToken(server);
  const res = await server.inject({
    method: "GET",
    url: "/dex",
    headers: { authorization: `Bearer ${token}` },
  });
  const entries = res.json() as { species_id: string; name: string; discovered: boolean }[];
  const dandelion = entries.find((e) => e.species_id === "taxon-dandelion");
  assert.equal(dandelion?.discovered, false);
  assert.equal(dandelion?.name, "서양민들레");
  assert.notEqual(dandelion?.name, "???");
});

test("GET /dex: ?group= 으로 서버사이드 필터링(곤충 31종)", async () => {
  const { server } = await testServer();
  const token = await signupAndGetToken(server);
  const res = await server.inject({
    method: "GET",
    url: "/dex?group=곤충",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const entries = res.json();
  const insectCount = SEED_TAXA.filter((t) => t.group === "insect").length;
  assert.equal(entries.length, insectCount);
  assert.ok(entries.every((e: { group: string }) => e.group === "곤충"));
});

test("GET /dex: 존재하지 않는 ?group= 값은 빈 배열(에러 아님)", async () => {
  const { server } = await testServer();
  const token = await signupAndGetToken(server);
  const res = await server.inject({
    method: "GET",
    url: "/dex?group=우주생물",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);
});

test("GET /dex: ?sort=name 이면 이름 가나다순으로 정렬된다(발견한 종만 의미 있음)", async () => {
  const { server } = await testServer();
  const token = await signupAndGetToken(server);
  const res = await server.inject({
    method: "GET",
    url: "/dex?sort=name",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const entries = res.json() as { name: string }[];
  const names = entries.map((e) => e.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "ko"));
  assert.deepEqual(names, sorted);
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

test("GET /species/:id/card: observe_points/quiz가 콘텐츠에서 채워진다", async () => {
  const { server } = await testServer();
  // 시드 콘텐츠(SEED_CONTENT)에 관찰포인트+퀴즈가 있는 종으로 확인(민들레).
  const res = await server.inject({ method: "GET", url: "/species/taxon-dandelion/card" });
  assert.equal(res.statusCode, 200);
  const card = res.json();
  assert.ok(Array.isArray(card.observe_points));
  assert.ok(card.observe_points.length > 0);
  assert.ok(Array.isArray(card.quiz));
  assert.ok(card.quiz.length > 0);
  assert.ok(typeof card.quiz[0].q === "string");
  assert.ok(Array.isArray(card.quiz[0].options));
  assert.ok(typeof card.quiz[0].answerIndex === "number");
});

test("GET /species/:id/card: similar_species가 confusionPairs 기반 실제 taxonId로 채워진다", async () => {
  const { server } = await testServer();
  // 배추흰나비(Pieris rapae)는 confusionPairs.ts에 큰줄흰나비/푸른부전나비 두 쌍으로 등록돼 있다.
  const res = await server.inject({ method: "GET", url: "/species/taxon-cabbage-white/card" });
  assert.equal(res.statusCode, 200);
  const card = res.json();
  const ids = card.similar_species.map((s: { species_id: string }) => s.species_id).sort();
  assert.deepEqual(ids, ["taxon-celastrina-argiolus", "taxon-pieris-melete"]);
  // 탭했을 때 실제 종 카드로 이동할 수 있어야 하므로 name도 실제 국명이어야 한다(문자열 placeholder 아님).
  const melete = card.similar_species.find((s: { species_id: string }) => s.species_id === "taxon-pieris-melete");
  assert.equal(melete.name, "큰줄흰나비");
});

test("GET /species/:id/card: observe_points/quiz는 항상 배열로 나온다(콘텐츠 없어도 404 아님)", async () => {
  const { server } = await testServer();
  const taxon = SEED_TAXA[0]!;
  const res = await server.inject({ method: "GET", url: `/species/${taxon.id}/card` });
  assert.equal(res.statusCode, 200);
  const card = res.json();
  assert.ok(Array.isArray(card.observe_points));
  assert.ok(Array.isArray(card.quiz));
});
