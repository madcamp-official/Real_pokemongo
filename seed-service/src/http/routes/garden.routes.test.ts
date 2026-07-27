import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp, type App } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { buildHttpServer } from "../server.js";
import { makeCleanJpeg } from "../../core/media/fixtures.js";

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

/** 민들레를 high 확신으로 관찰·확정 -> 개체 자동 생성. */
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

test("GET /garden/layout: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/garden/layout" });
  assert.equal(res.statusCode, 401);
});

test("GET /garden/layout: 저장한 적 없으면 기본 6x6 정원을 돌려준다(배치는 없음)", async () => {
  const { server } = await testServer();
  const { token } = await signupWithUser(server);
  const res = await server.inject({
    method: "GET",
    url: "/garden/layout",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.tiles.length, 36);
  assert.deepEqual(body.placements, []);
});

test("PUT → GET 왕복: 저장한 배치가 그대로 조회되고 species_id도 채워진다", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);
  await observeDandelion(app, token, server);
  const creature = (await app.repos.creatures.listByUser(userId as never))[0]!;

  const putRes = await server.inject({
    method: "PUT",
    url: "/garden/layout",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      tiles: [{ row: 0, col: 0, type: "잔디" }, { row: 0, col: 1, type: "흙" }],
      placements: [{ creature_id: creature.id, row: 0, col: 0 }],
    },
  });
  assert.equal(putRes.statusCode, 200);

  const getRes = await server.inject({
    method: "GET",
    url: "/garden/layout",
    headers: { authorization: `Bearer ${token}` },
  });
  const body = getRes.json();
  assert.equal(body.tiles.length, 2);
  assert.equal(body.tiles.find((t: any) => t.row === 0 && t.col === 0).type, "잔디");
  assert.equal(body.placements.length, 1);
  assert.equal(body.placements[0].creature_id, creature.id);
  assert.equal(body.placements[0].species_id, "taxon-dandelion");
});

test("PUT /garden/layout: 존재하지 않거나 남의 개체를 배치하면 400", async () => {
  const { app, server } = await testServer();
  const { token: tokenA } = await signupWithUser(server);
  const { token: tokenB, userId: userIdB } = await signupWithUser(server);
  await observeDandelion(app, tokenB, server);
  const creatureB = (await app.repos.creatures.listByUser(userIdB as never))[0]!;

  const res = await server.inject({
    method: "PUT",
    url: "/garden/layout",
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      tiles: [{ row: 0, col: 0, type: "잔디" }],
      placements: [{ creature_id: creatureB.id, row: 0, col: 0 }],
    },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_placement");
});

test("PUT /garden/layout: 같은 개체를 두 자리에 놓으면 400", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);
  await observeDandelion(app, token, server);
  const creature = (await app.repos.creatures.listByUser(userId as never))[0]!;

  const res = await server.inject({
    method: "PUT",
    url: "/garden/layout",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      tiles: [{ row: 0, col: 0, type: "잔디" }, { row: 0, col: 1, type: "잔디" }],
      placements: [
        { creature_id: creature.id, row: 0, col: 0 },
        { creature_id: creature.id, row: 0, col: 1 },
      ],
    },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "duplicate_placement");
});

test("PUT /garden/layout: 정의되지 않은 타일 좌표에 배치하면 400", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);
  await observeDandelion(app, token, server);
  const creature = (await app.repos.creatures.listByUser(userId as never))[0]!;

  const res = await server.inject({
    method: "PUT",
    url: "/garden/layout",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      tiles: [{ row: 0, col: 0, type: "잔디" }],
      placements: [{ creature_id: creature.id, row: 5, col: 5 }],
    },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_placement");
});

test("PUT /garden/layout: 알 수 없는 타일 종류는 400", async () => {
  const { server } = await testServer();
  const { token } = await signupWithUser(server);
  const res = await server.inject({
    method: "PUT",
    url: "/garden/layout",
    headers: { authorization: `Bearer ${token}` },
    payload: { tiles: [{ row: 0, col: 0, type: "용암" }], placements: [] },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_tile_type");
});

test("GET /garden/tile-compatibility: 인증 없이도 조회되고 5개 그룹을 담는다", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/garden/tile-compatibility" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(Object.keys(body).sort(), ["곤충", "기타", "식물", "양서류", "조류"]);
  assert.ok(body["곤충"].includes("잔디"));
  assert.ok(body["조류"].includes("잔디"));
});
