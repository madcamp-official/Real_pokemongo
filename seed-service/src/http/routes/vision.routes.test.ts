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

const cleanJpegBase64 = () => Buffer.from(makeCleanJpeg()).toString("base64");

async function signupWithUser(server: Awaited<ReturnType<typeof testServer>>["server"]) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: `${randomUUID()}@b.com`, password: "pw12345", nickname: "A", avatar: "fox", privacy: true, location: true, photo: true, consent_version: "v1" },
  });
  const body = res.json();
  return { token: body.access_token as string, userId: body.user.user_id as string };
}

test("POST /vision/preview-scan: 인증 없이도 200(공개 엔드포인트)", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/vision/preview-scan",
    payload: { x: 0.5, y: 0.5, image: cleanJpegBase64() },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(typeof body.species_guess === "string");
  assert.equal(typeof body.is_dangerous, "boolean");
  assert.equal(typeof body.confidence, "number");
});

test("POST /vision/preview-scan: 위험 종(양봉꿀벌)이면 is_dangerous=true", async () => {
  const { app, server } = await testServer();
  app.mock.enqueue([
    { scientificName: "Apis mellifera", vernacularName: "양봉꿀벌 (서양종꿀벌)", rank: "species", confidence: 0.9 },
  ]);
  const res = await server.inject({
    method: "POST",
    url: "/vision/preview-scan",
    payload: { x: 0.5, y: 0.5, image: cleanJpegBase64() },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.is_dangerous, true);
  assert.equal(body.species_guess, "양봉꿀벌 (서양종꿀벌)");
});

test("POST /vision/preview-scan: 안전 종(서양민들레)이면 is_dangerous=false", async () => {
  const { app, server } = await testServer();
  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "서양민들레", rank: "species", confidence: 0.92 },
  ]);
  const res = await server.inject({
    method: "POST",
    url: "/vision/preview-scan",
    payload: { x: 0.5, y: 0.5, image: cleanJpegBase64() },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.is_dangerous, false);
  assert.equal(body.species_guess, "서양민들레");
});

test("POST /vision/preview-scan: 미지 포맷 이미지는 400(전역 에러 핸들러가 매핑)", async () => {
  const { server } = await testServer();
  const garbage = Buffer.from("이건 이미지가 아니에요", "utf8").toString("base64");
  const res = await server.inject({
    method: "POST",
    url: "/vision/preview-scan",
    payload: { x: 0.5, y: 0.5, image: garbage },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_image");
});

test("POST /vision/preview-scan: 필수 필드 누락은 400(스키마 검증)", async () => {
  const { server } = await testServer();
  const res = await server.inject({
    method: "POST",
    url: "/vision/preview-scan",
    payload: { x: 0.5, y: 0.5 },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /vision/preview-scan: 호출해도 도감/개체에는 전혀 반영되지 않는다(부수효과 없음)", async () => {
  const { app, server } = await testServer();
  const { token, userId } = await signupWithUser(server);

  app.mock.enqueue([
    { scientificName: "Apis mellifera", vernacularName: "꿀벌", rank: "species", confidence: 0.95 },
  ]);
  await server.inject({
    method: "POST",
    url: "/vision/preview-scan",
    payload: { x: 0.3, y: 0.4, image: cleanJpegBase64() },
  });

  const dex = await server.inject({
    method: "GET",
    url: "/dex",
    headers: { authorization: `Bearer ${token}` },
  });
  const entries = dex.json() as { discovered: boolean }[];
  assert.ok(entries.every((e) => e.discovered === false), "preview-scan이 도감을 해금시키면 안 됨");

  const creatures = await app.repos.creatures.listByUser(userId as never);
  assert.equal(creatures.length, 0, "preview-scan이 개체를 생성하면 안 됨");
});

test("POST /vision/preview-scan: IP당 분당 한도를 넘으면 429", async () => {
  const { server } = await testServer();
  let last;
  for (let i = 0; i < 21; i++) {
    last = await server.inject({
      method: "POST",
      url: "/vision/preview-scan",
      payload: { x: 0.5, y: 0.5, image: cleanJpegBase64() },
    });
  }
  assert.equal(last!.statusCode, 429);
  assert.equal(last!.json().error, "rate_limited");
});
