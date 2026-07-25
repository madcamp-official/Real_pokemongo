/**
 * F2/F4 라우트 통합테스트 — 실제 multipart/form-data 업로드부터 확정까지 전체 왕복.
 * Node 내장 FormData/Blob/Request만으로 진짜 멀티파트 바디를 만든다(새 의존성 없음).
 * 동정은 항상 MockProvider를 태운다 — GPU/외부 API를 절대 타지 않는다(계획 전제).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp, type App } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { buildHttpServer } from "../server.js";
import { makeCleanJpeg } from "../../core/media/fixtures.js";
import type { FastifyInstance } from "fastify";

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

async function testServer(): Promise<{ app: App; server: FastifyInstance }> {
  const app = await buildApp(testConfig());
  const server = await buildHttpServer(app);
  return { app, server };
}

async function signup(server: FastifyInstance) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: `${randomUUID()}@b.com`, password: "pw12345", nickname: "A", avatar: "fox" },
  });
  return res.json().access_token as string;
}

/** Node 내장 FormData/Blob/Request로 진짜 multipart 바디 + content-type(boundary 포함)을 만든다. */
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

async function upload(server: FastifyInstance, token: string, frames: Uint8Array[] = [makeCleanJpeg()]) {
  const { body, contentType } = await buildMultipartUpload(frames);
  return server.inject({
    method: "POST",
    url: "/sightings/upload",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload: body,
  });
}

test("POST /sightings/upload: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const { body, contentType } = await buildMultipartUpload([makeCleanJpeg()]);
  const res = await server.inject({
    method: "POST",
    url: "/sightings/upload",
    headers: { "content-type": contentType },
    payload: body,
  });
  assert.equal(res.statusCode, 401);
});

test("POST /sightings/upload: 정상 JPEG 1장 업로드 → sighting_id 반환", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const res = await upload(server, token);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.sighting_id);
  assert.equal(body.status, "done");
});

test("POST /sightings/upload: 사진이 0장이면 400", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const res = await upload(server, token, []);
  assert.equal(res.statusCode, 400);
});

test("POST /sightings/upload: 미지 포맷 바이트는 400(전역 에러 핸들러가 매핑)", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const res = await upload(server, token, [garbage]);
  assert.equal(res.statusCode, 400);
});

test("POST /identify: 남의 sighting은 404(존재 여부 누설 방지)", async () => {
  const { server } = await testServer();
  const tokenA = await signup(server);
  const tokenB = await signup(server);
  const up = await upload(server, tokenA);
  const sightingId = up.json().sighting_id;

  const res = await server.inject({
    method: "POST",
    url: "/identify",
    headers: { authorization: `Bearer ${tokenB}` },
    payload: { sighting_id: sightingId },
  });
  assert.equal(res.statusCode, 404);
});

test("전체 왕복: upload → identify(high 확신) → confirm → 도감에 반영", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  const up = await upload(server, token);
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
  assert.equal(identifyRes.statusCode, 200);
  const identifyBody = identifyRes.json();
  assert.equal(identifyBody.candidates.length, 1);
  assert.equal(identifyBody.needs_user_confirmation, false, "high 확신이므로 확인 불필요");
  const speciesId = identifyBody.candidates[0].species_id;

  const confirmRes = await server.inject({
    method: "POST",
    url: "/identify/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId, species_id: speciesId },
  });
  assert.equal(confirmRes.statusCode, 200);

  // 실제로 도감에 반영됐는지 GET /dex로 재확인(라우트를 경유한 진짜 종단 검증).
  const dexRes = await server.inject({
    method: "GET",
    url: "/dex",
    headers: { authorization: `Bearer ${token}` },
  });
  const entries = dexRes.json() as Array<{ species_id: string; discovered: boolean }>;
  const found = entries.find((e) => e.species_id === speciesId);
  assert.ok(found?.discovered, "confirm 이후 도감에 해금돼야 함");
});

test("POST /identify/confirm: 먼저 /identify 없이 호출하면 400", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const up = await upload(server, token);
  const res = await server.inject({
    method: "POST",
    url: "/identify/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: up.json().sighting_id, species_id: "whatever" },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /identify/confirm: 후보에 없는 species_id는 400(위조 방지)", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  const up = await upload(server, token);
  const sightingId = up.json().sighting_id;

  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.93 },
  ]);
  await server.inject({
    method: "POST",
    url: "/identify",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId },
  });

  const res = await server.inject({
    method: "POST",
    url: "/identify/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId, species_id: "not-a-real-candidate" },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /identify/confirm: 확정 후 같은 sighting으로 재확정하면 404(소비됨)", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  const up = await upload(server, token);
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
  const speciesId = identifyRes.json().candidates[0].species_id;

  const first = await server.inject({
    method: "POST",
    url: "/identify/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId, species_id: speciesId },
  });
  assert.equal(first.statusCode, 200);

  const second = await server.inject({
    method: "POST",
    url: "/identify/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId, species_id: speciesId },
  });
  assert.equal(second.statusCode, 404);
});
