/**
 * F6 도감 상세 "지금까지 찍은 사진" 갤러리 라우트 통합테스트.
 * sightings.routes.test.ts와 동일한 실제 multipart 업로드 → identify → confirm
 * 왕복으로 진짜 media(디스크에 저장된 보정본)를 가진 observation을 만든 뒤 검증한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { buildApp, type App } from "../../composition.js";
import { loadConfig, type AppConfig } from "../../config/index.js";
import { buildHttpServer } from "../server.js";
import type { FastifyInstance } from "fastify";

function testConfig(): AppConfig {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  cfg.mediaStorage.localDir = join(tmpdir(), `seed-service-test-${randomUUID()}`);
  cfg.auth.jwtSecret = "test-secret-not-for-production";
  return cfg;
}

async function testServer(): Promise<{ app: App; server: FastifyInstance }> {
  const app = await buildApp(testConfig());
  const server = await buildHttpServer(app);
  return { app, server };
}

async function signup(server: FastifyInstance) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      email: `${randomUUID()}@b.com`,
      password: "pw12345",
      nickname: "A",
      avatar: "fox",
      privacy: true,
      location: true,
      photo: true,
      consent_version: "v1",
    },
  });
  const body = res.json();
  return { token: body.access_token as string, userId: body.user.user_id as string };
}

async function realJpeg(): Promise<Uint8Array> {
  const img = sharp({
    create: { width: 128, height: 96, channels: 3, background: { r: 120, g: 130, b: 140 } },
  });
  return new Uint8Array(await img.jpeg({ quality: 90 }).toBuffer());
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

/** upload → identify(항상 high 확신) → confirm 까지 마쳐서 media가 실제로 저장된 observation을 만든다. */
async function recordOneObservation(app: App, server: FastifyInstance, token: string) {
  const { body, contentType } = await buildMultipartUpload([await realJpeg()]);
  const up = await server.inject({
    method: "POST",
    url: "/sightings/upload",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload: body,
  });
  const sightingId = up.json().sighting_id;

  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.93 },
  ]);
  const identifyRes = await server.inject({
    method: "POST",
    url: "/identify",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId },
  });
  const speciesId = identifyRes.json().candidates[0].species_id as string;

  await server.inject({
    method: "POST",
    url: "/identify/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId, species_id: speciesId },
  });

  return { speciesId };
}

test("GET /species/:speciesId/photos: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/species/whatever/photos" });
  assert.equal(res.statusCode, 401);
});

test("GET /species/:speciesId/photos: 촬영 기록이 없으면 빈 배열", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const res = await server.inject({
    method: "GET",
    url: "/species/no-such-species/photos",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { photos: [] });
});

test("GET /species/:speciesId/photos: 확정한 관찰이 목록에 나타난다", async () => {
  const { app, server } = await testServer();
  const { token } = await signup(server);
  const { speciesId } = await recordOneObservation(app, server, token);

  const res = await server.inject({
    method: "GET",
    url: `/species/${speciesId}/photos`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const { photos } = res.json();
  assert.equal(photos.length, 1);
  assert.ok(photos[0].observation_id);
  // url에 관찰 전용 단기 토큰(mt)이 쿼리로 실려 있어야 <Image>가 헤더 없이도 인증된다.
  assert.match(photos[0].url, new RegExp(`^/media/${photos[0].observation_id}\\?mt=.+`));
  assert.ok(photos[0].taken_at);
});

test("GET /species/:speciesId/photos: 다른 사용자의 촬영 기록은 보이지 않는다", async () => {
  const { app, server } = await testServer();
  const { token: tokenA } = await signup(server);
  const { token: tokenB } = await signup(server);
  const { speciesId } = await recordOneObservation(app, server, tokenA);

  const res = await server.inject({
    method: "GET",
    url: `/species/${speciesId}/photos`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.deepEqual(res.json(), { photos: [] });
});

// ── /media/:observationId: Method A(단기 서명 토큰, mt 쿼리) ────────────────────
// 이 라우트는 더 이상 Authorization 헤더를 보지 않는다(<Image>가 커스텀 헤더를 못
// 붙이는 실기기 이슈 때문 — photos.routes.ts 상단 주석 참고). 소유권 검사는 목록
// API가 mt를 "발급"할 때 끝나고, 여기서는 서명·만료·관찰ID 일치만 확인한다.

async function listPhotoUrl(server: FastifyInstance, token: string, speciesId: string): Promise<string> {
  const list = await server.inject({
    method: "GET",
    url: `/species/${speciesId}/photos`,
    headers: { authorization: `Bearer ${token}` },
  });
  return list.json().photos[0].url as string;
}

test("GET /media/:observationId: mt 쿼리 없이 요청하면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/media/whatever" });
  assert.equal(res.statusCode, 401);
});

test("GET /media/:observationId: mt가 위조/무의미한 값이면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: `/media/${randomUUID()}?mt=garbage` });
  assert.equal(res.statusCode, 401);
});

test("GET /media/:observationId: 실제 이미지 바이트를 image/jpeg로 돌려준다(mt로 인증)", async () => {
  const { app, server } = await testServer();
  const { token } = await signup(server);
  const { speciesId } = await recordOneObservation(app, server, token);

  const url = await listPhotoUrl(server, token, speciesId);
  const res = await server.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "image/jpeg");
  assert.ok(res.rawPayload.length > 0);
  // JPEG SOI 매직 바이트(FF D8 FF)로 실제 이미지 바이트임을 확인.
  assert.equal(res.rawPayload[0], 0xff);
  assert.equal(res.rawPayload[1], 0xd8);
  assert.equal(res.rawPayload[2], 0xff);
});

test("GET /media/:observationId: 다른 관찰의 mt를 URL만 바꿔 재사용하면 401(토큰이 관찰 ID에 고정됨)", async () => {
  const { app, server } = await testServer();
  const { token: tokenA } = await signup(server);
  const { token: tokenB } = await signup(server);
  const { speciesId: speciesA } = await recordOneObservation(app, server, tokenA);
  const { speciesId: speciesB } = await recordOneObservation(app, server, tokenB);

  const urlA = await listPhotoUrl(server, tokenA, speciesA);
  const urlB = await listPhotoUrl(server, tokenB, speciesB);
  const observationIdB = urlB.split("?")[0]!.split("/").pop();
  const mtA = new URL(urlA, "http://local").searchParams.get("mt");

  // B의 관찰 ID에 A의 mt(다른 관찰용으로 서명됨)를 갖다 붙여본다 — 서명 대상에
  // observationId가 포함돼 있어 그대로는 통과할 수 없어야 한다.
  const res = await server.inject({ method: "GET", url: `/media/${observationIdB}?mt=${mtA}` });
  assert.equal(res.statusCode, 401);
});

