import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildApp } from "../composition.js";
import { loadConfig } from "../config/index.js";
import { buildHttpServer } from "./server.js";

async function makeServer() {
  const config = loadConfig();
  config.nodeEnv = "test";
  config.database.url = undefined;
  config.auth.jwtSecret = "health-test-secret";
  config.mediaStorage.localDir = join(
    tmpdir(),
    `nature-go-health-${randomUUID()}`,
  );
  const app = await buildApp(config);
  return buildHttpServer(app);
}

test("GET /health는 인증 없이 liveness를 반환한다", async () => {
  const server = await makeServer();
  const response = await server.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "nature-go-api",
  });
  await server.close();
});

test("GET /ready는 테스트 InMemory 저장소를 준비 상태로 보고한다", async () => {
  const server = await makeServer();
  const response = await server.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ready: true,
    database: "in_memory",
  });
  await server.close();
});
