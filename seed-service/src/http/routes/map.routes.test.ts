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
  cfg.map.kakaoJsKey = "test-kakao-key";
  return cfg;
}

async function testServer() {
  const app = await buildApp(testConfig());
  const server = await buildHttpServer(app);
  return { app, server };
}

async function signupWithUser(
  server: Awaited<ReturnType<typeof testServer>>["server"],
  locationEnabled = true,
) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      email: `${randomUUID()}@b.com`,
      password: "pw12345",
      nickname: "A",
      avatar: "fox",
      privacy: true,
      location: locationEnabled,
      photo: true,
      consent_version: "v1",
    },
  });
  const body = res.json();
  return { token: body.access_token as string, userId: body.user.user_id as string };
}

async function buildMultipartUpload(
  frames: Uint8Array[],
  coord?: { lat: number; lng: number },
): Promise<{ body: Buffer; contentType: string }> {
  const form = new FormData();
  frames.forEach((bytes, i) => {
    form.append("frames", new Blob([bytes as BlobPart], { type: "image/jpeg" }), `frame${i}.jpg`);
  });
  if (coord) {
    form.append("lat", String(coord.lat));
    form.append("lng", String(coord.lng));
  }
  const req = new Request("http://local/upload", { method: "POST", body: form });
  const contentType = req.headers.get("content-type")!;
  const body = Buffer.from(await req.arrayBuffer());
  return { body, contentType };
}

/** 민들레를 정밀 좌표와 함께 관찰·확정. */
async function observeDandelionAt(
  app: App,
  token: string,
  server: Awaited<ReturnType<typeof testServer>>["server"],
  coord?: { lat: number; lng: number },
) {
  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "서양민들레", rank: "species", confidence: 0.92 },
  ]);
  const { body, contentType } = await buildMultipartUpload([makeCleanJpeg()], coord);
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

test("GET /map.html: 인증 없이도 200, 카카오 SDK 스크립트와 키가 포함된다", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/map.html" });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] as string, /text\/html/);
  assert.match(res.body, /dapi\.kakao\.com\/v2\/maps\/sdk\.js\?appkey=test-kakao-key/);
  assert.match(res.body, /pin-initial/);
  assert.match(res.body, /function displayPosition/);
  assert.doesNotMatch(res.body, /pin-card/);
});

test("GET /map/pins: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/map/pins" });
  assert.equal(res.statusCode, 401);
});

test("GET /map/pins: 관찰 전에는 빈 배열", async () => {
  const { server } = await testServer();
  const { token } = await signupWithUser(server);
  const res = await server.inject({
    method: "GET",
    url: "/map/pins",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);
});

test("GET /map/pins: 정밀 좌표와 함께 확정한 관찰은 핀으로 반환된다", async () => {
  const { app, server } = await testServer();
  const { token } = await signupWithUser(server);
  await observeDandelionAt(app, token, server, { lat: 37.5, lng: 127.0 });

  const res = await server.inject({
    method: "GET",
    url: "/map/pins",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const pins = res.json();
  assert.equal(pins.length, 1);
  assert.equal(pins[0].species_id, "taxon-dandelion");
  assert.equal(pins[0].species_name, "서양민들레");
  assert.equal(pins[0].group, "식물");
  assert.equal(pins[0].lat, 37.5);
  assert.equal(pins[0].lng, 127.0);
});

test("GET /map/pins: 좌표 없이 확정한 관찰은 핀에 안 나온다", async () => {
  const { app, server } = await testServer();
  const { token } = await signupWithUser(server);
  await observeDandelionAt(app, token, server); // coord 없음

  const res = await server.inject({
    method: "GET",
    url: "/map/pins",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.deepEqual(res.json(), []);
});

test("GET /map/pins: 남의 관찰은 안 보인다", async () => {
  const { app, server } = await testServer();
  const { token: tokenA } = await signupWithUser(server);
  await observeDandelionAt(app, tokenA, server, { lat: 37.5, lng: 127.0 });
  const { token: tokenB } = await signupWithUser(server);

  const res = await server.inject({
    method: "GET",
    url: "/map/pins",
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.deepEqual(res.json(), []);
});

test("GET /map/explored-regions: 위치 저장을 껐으면 current_location은 null", async () => {
  const { app, server } = await testServer();
  const { token } = await signupWithUser(server, false);
  await observeDandelionAt(app, token, server, { lat: 37.5, lng: 127.0 });

  const res = await server.inject({
    method: "GET",
    url: "/map/explored-regions",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.current_location, null);
  assert.deepEqual(body.blobs, []);
  assert.equal(body.home_zone, null);
});

test("GET /map/explored-regions: 위치 저장을 켰으면 가장 최근 정밀 좌표가 current_location", async () => {
  const { app, server } = await testServer();
  const { token } = await signupWithUser(server, true);
  await observeDandelionAt(app, token, server, { lat: 37.5, lng: 127.0 });

  const res = await server.inject({
    method: "GET",
    url: "/map/explored-regions",
    headers: { authorization: `Bearer ${token}` },
  });
  const body = res.json();
  assert.deepEqual(body.current_location, { lat: 37.5, lng: 127.0 });
});
