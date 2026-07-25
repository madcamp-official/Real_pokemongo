import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp, type App } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { buildHttpServer } from "../server.js";
import { makeCleanJpeg } from "../../core/media/fixtures.js";
import { newCreatureId } from "../../core/domain/ids.js";

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

async function signupWithUser(server: Awaited<ReturnType<typeof testServer>>["server"]) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: `${randomUUID()}@b.com`, password: "pw12345", nickname: "A", avatar: "fox", privacy: true, location: true, photo: true, consent_version: "v1" },
  });
  const body = res.json();
  return { token: body.access_token as string, userId: body.user.user_id as string };
}

async function buildMultipartUpload(frames: Uint8Array[]): Promise<{ body: Buffer; contentType: string }> {
  const form = new FormData();
  frames.forEach((bytes, i) => {
    form.append("frames", new Blob([bytes as BlobPart], { type: "image/jpeg" }), `frame${i}.jpg`);
  });
  const req = new Request("http://local/upload", { method: "POST", body: form });
  const contentType = req.headers.get("content-type")!;
  const body = Buffer.from(await req.arrayBuffer());
  return { body, contentType };
}

/** 민들레를 high 확신으로 관찰·확정 -> 개체 자동 생성. 생성된 sighting/species 조합 반환. */
async function observeDandelion(app: App, token: string, server: Awaited<ReturnType<typeof testServer>>["server"]) {
  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.92 },
  ]);
  const { body, contentType } = await buildMultipartUpload([makeCleanJpeg()]);
  const upload = await server.inject({
    method: "POST",
    url: "/sightings/upload",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload: body,
  });
  const sightingId = upload.json().sighting_id as string;
  const identify = await server.inject({
    method: "POST",
    url: "/identify",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId },
  });
  const speciesId = identify.json().candidates[0].species_id as string;
  await server.inject({
    method: "POST",
    url: "/identify/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId, species_id: speciesId },
  });
}

test("종 첫 해금 시 개체가 자동 생성되고 GET /dex에 반영된다", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);
  await observeDandelion(app, token, server);

  const creatures = await app.repos.creatures.listByUser(userId as never);
  assert.equal(creatures.length, 1);
  assert.equal(creatures[0]!.taxonId, "taxon-dandelion");

  const dex = await server.inject({ method: "GET", url: "/dex", headers: { authorization: `Bearer ${token}` } });
  const entries = dex.json() as { species_id: string; creatures: { id: string }[] }[];
  const dandelion = entries.find((e) => e.species_id === "taxon-dandelion");
  assert.equal(dandelion!.creatures.length, 1);
  assert.equal(dandelion!.creatures[0]!.id, creatures[0]!.id as string);
});

test("POST /creatures/:id/name: 작명하면 저장되고 GET /dex에도 반영된다", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);
  await observeDandelion(app, token, server);

  const creatures = await app.repos.creatures.listByUser(userId as never);
  const creatureId = creatures[0]!.id as string;

  const res = await server.inject({
    method: "POST",
    url: `/creatures/${creatureId}/name`,
    headers: { authorization: `Bearer ${token}` },
    payload: { nickname: "점박이" },
  });
  assert.equal(res.statusCode, 200);

  const dex = await server.inject({ method: "GET", url: "/dex", headers: { authorization: `Bearer ${token}` } });
  const entries = dex.json() as { species_id: string; creatures: { nickname?: string }[] }[];
  const dandelion = entries.find((e) => e.species_id === "taxon-dandelion");
  assert.equal(dandelion!.creatures[0]!.nickname, "점박이");
});

test("POST /creatures/:id/name: 존재하지 않는 개체는 404", async () => {
  const { server } = await testServer();
  const { token } = await signupWithUser(server);
  const res = await server.inject({
    method: "POST",
    url: `/creatures/${newCreatureId()}/name`,
    headers: { authorization: `Bearer ${token}` },
    payload: { nickname: "아무개" },
  });
  assert.equal(res.statusCode, 404);
});

test("POST /creatures/:id/name: 남의 개체는 404(존재 여부 누설 방지)", async () => {
  const { app, server } = await testServer();
  const { token: tokenA, userId: userIdA } = await signupWithUser(server);
  await observeDandelion(app, tokenA, server);
  const aCreatures = await app.repos.creatures.listByUser(userIdA as never);
  const creatureId = aCreatures[0]!.id as string;

  const { token: tokenB } = await signupWithUser(server);
  const res = await server.inject({
    method: "POST",
    url: `/creatures/${creatureId}/name`,
    headers: { authorization: `Bearer ${tokenB}` },
    payload: { nickname: "가로채기" },
  });
  assert.equal(res.statusCode, 404);
});

test("GET /creatures/:id/status: 방금 생긴 개체는 함께한 일수 0, bond 1, 재회 아님", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);
  await observeDandelion(app, token, server);
  const creatureId = (await app.repos.creatures.listByUser(userId as never))[0]!.id as string;

  const res = await server.inject({
    method: "GET",
    url: `/creatures/${creatureId}/status`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.creature_id, creatureId);
  assert.equal(body.days_together, 0);
  assert.equal(body.bond, 1);
  assert.equal(body.bond_max, 5);
  assert.equal(body.is_reunion, false);
  assert.ok(body.status_message.length > 0);
});

test("GET /creatures/:id/status: 존재하지 않거나 남의 개체는 404", async () => {
  const { app, server } = await testServer();
  const { token: tokenA, userId: userIdA } = await signupWithUser(server);
  await observeDandelion(app, tokenA, server);
  const creatureId = (await app.repos.creatures.listByUser(userIdA as never))[0]!.id as string;

  const { token: tokenB } = await signupWithUser(server);
  const res = await server.inject({
    method: "GET",
    url: `/creatures/${creatureId}/status`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.equal(res.statusCode, 404);

  const missing = await server.inject({
    method: "GET",
    url: `/creatures/${newCreatureId()}/status`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(missing.statusCode, 404);
});

test("POST /creatures/:id/interact: bond가 1 오르고 lastInteractionAt이 저장된다", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);
  await observeDandelion(app, token, server);
  const creatureId = (await app.repos.creatures.listByUser(userId as never))[0]!.id as string;

  const res = await server.inject({
    method: "POST",
    url: `/creatures/${creatureId}/interact`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.bond, 2, "초기 bond 1에서 상호작용 1회로 2");
  assert.equal(body.bond_max, 5);
  assert.equal(body.bond_leveled_up, true);

  const stored = await app.repos.creatures.get(creatureId as never);
  assert.equal(stored!.bond, 2);
  assert.ok(stored!.lastInteractionAt, "상호작용 시각이 저장돼야 함");
});

test("POST /creatures/:id/interact: bond는 bond_max(5)를 넘지 않는다", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);
  await observeDandelion(app, token, server);
  const creatureId = (await app.repos.creatures.listByUser(userId as never))[0]!.id as string;

  let last;
  for (let i = 0; i < 10; i++) {
    last = await server.inject({
      method: "POST",
      url: `/creatures/${creatureId}/interact`,
      headers: { authorization: `Bearer ${token}` },
    });
  }
  assert.equal(last!.json().bond, 5);
  assert.equal(last!.json().bond_leveled_up, false, "이미 최대치라 더 안 오름");
});

test("POST /creatures/:id/interact: 존재하지 않거나 남의 개체는 404", async () => {
  const { server } = await testServer();
  const { token } = await signupWithUser(server);
  const res = await server.inject({
    method: "POST",
    url: `/creatures/${newCreatureId()}/interact`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 404);
});
