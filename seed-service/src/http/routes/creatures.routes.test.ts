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
    payload: { email: `${randomUUID()}@b.com`, password: "pw12345", nickname: "A", avatar: "fox" },
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
