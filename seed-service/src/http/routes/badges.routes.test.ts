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

async function signup(server: Awaited<ReturnType<typeof testServer>>["server"]) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: `${randomUUID()}@b.com`, password: "pw12345", nickname: "A", avatar: "fox", privacy: true, location: true, photo: true, consent_version: "v1" },
  });
  return res.json().access_token as string;
}

/** Node 내장 FormData/Blob/Request로 진짜 multipart 바디 + content-type(boundary 포함)을 만든다. */
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

/** 실제 관찰을 만들어 badge-first-find를 규칙 기반으로 해금시킨다. */
async function observeOnceHigh(app: App, token: string, server: Awaited<ReturnType<typeof testServer>>["server"]) {
  app.mock.enqueue([{ scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.92 }]);
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

test("GET /profile/xp: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/profile/xp" });
  assert.equal(res.statusCode, 401);
});

test("GET /badges: 관찰 전에는 전부 unlocked=false", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const res = await server.inject({ method: "GET", url: "/badges", headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const badges = res.json();
  assert.ok(badges.length >= 5);
  assert.ok(badges.every((b: { unlocked: boolean }) => b.unlocked === false));
});

test("관찰 1회 후: badge-first-find는 unlocked=true, claimed=false", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  await observeOnceHigh(app, token, server);

  const res = await server.inject({ method: "GET", url: "/badges", headers: { authorization: `Bearer ${token}` } });
  const badges = res.json() as { badge_id: string; unlocked: boolean; claimed: boolean }[];
  const firstFind = badges.find((b) => b.badge_id === "badge-first-find");
  assert.ok(firstFind);
  assert.equal(firstFind!.unlocked, true);
  assert.equal(firstFind!.claimed, false);
});

test("POST /badges/claim: 해금된 배지를 claim하면 XP가 오르고 claimed=true가 된다", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  await observeOnceHigh(app, token, server);

  const before = await server.inject({ method: "GET", url: "/profile/xp", headers: { authorization: `Bearer ${token}` } });
  const xpBefore = before.json().xp as number;

  const claim = await server.inject({
    method: "POST",
    url: "/badges/claim",
    headers: { authorization: `Bearer ${token}` },
    payload: { badge_id: "badge-first-find" },
  });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json().xp, xpBefore + 5, "badge-first-find.xp=5");

  const res = await server.inject({ method: "GET", url: "/badges", headers: { authorization: `Bearer ${token}` } });
  const badges = res.json() as { badge_id: string; claimed: boolean }[];
  assert.equal(badges.find((b) => b.badge_id === "badge-first-find")!.claimed, true);
});

test("POST /badges/claim: 아직 해금 안 된 배지는 404", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const res = await server.inject({
    method: "POST",
    url: "/badges/claim",
    headers: { authorization: `Bearer ${token}` },
    payload: { badge_id: "badge-bug-master" },
  });
  assert.equal(res.statusCode, 404);
});

test("POST /badges/claim: 이미 claim한 배지를 다시 claim하면 400", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  await observeOnceHigh(app, token, server);
  await server.inject({
    method: "POST",
    url: "/badges/claim",
    headers: { authorization: `Bearer ${token}` },
    payload: { badge_id: "badge-first-find" },
  });
  const again = await server.inject({
    method: "POST",
    url: "/badges/claim",
    headers: { authorization: `Bearer ${token}` },
    payload: { badge_id: "badge-first-find" },
  });
  assert.equal(again.statusCode, 400);
});
