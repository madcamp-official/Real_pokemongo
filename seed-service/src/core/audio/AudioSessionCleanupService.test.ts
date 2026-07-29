/**
 * 골든 테스트: 5단계 TTL 스윕.
 * 핵심 불변식:
 *  - 만료된 세션만 지운다(안 만료된 건 그대로).
 *  - storagePath가 있으면 파일도 실제로 지운다.
 *  - 파일 삭제가 실패하면(진짜 실패 — ENOENT 아님) 이번엔 DB 행을 지우지 않고 남겨둔다
 *    (다음 스윕이 재시도할 수 있게).
 *  - storagePath가 없는(품질 거부) 세션은 파일 삭제 없이 바로 행만 지운다.
 *  - batchLimit을 넘는 만료 건은 이번 스윕에서 일부만 처리한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AudioSessionCleanupService } from "./AudioSessionCleanupService.js";
import { AudioTempStore } from "./AudioTempStore.js";
import { InMemoryAudioSightingRepo } from "../repositories/memory/InMemoryRepositories.js";
import type { AudioSighting } from "./audioTypes.js";
import type { UserId } from "../domain/types.js";

function makeSighting(overrides: Partial<AudioSighting> = {}): AudioSighting {
  const now = new Date("2026-07-28T00:00:00.000Z");
  return {
    id: randomUUID() as AudioSighting["id"],
    userId: randomUUID() as UserId,
    clientRecordingId: randomUUID(),
    status: "ready",
    mediaKind: "audio",
    mimeType: "audio/wav",
    durationMs: 4000,
    sha256: "a".repeat(64),
    quality: {
      usable: true,
      noisy: false,
      durationMs: 4000,
      activeDurationMs: 4000,
      snrDb: 20,
      clippingRatio: 0,
      silenceRatio: 0,
      speechRatio: 0,
      feedbackCodes: [],
      validSegments: [],
    },
    recordedAt: now.toISOString(),
    createdAt: now.toISOString(),
    expiresAt: now.toISOString(),
    ...overrides,
  };
}

const NOW = new Date("2026-07-28T12:00:00.000Z");
const EXPIRED = new Date(NOW.getTime() - 60_000).toISOString();
const NOT_EXPIRED = new Date(NOW.getTime() + 60_000).toISOString();

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "seed-audio-cleanup-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("만료된 세션만 지우고, 파일도 함께 지운다", async () => {
  await withTempDir(async (dir) => {
    const store = new AudioTempStore(dir);
    const repo = new InMemoryAudioSightingRepo();
    const storagePath = await store.save(Buffer.from("audio-bytes"));

    const expired = makeSighting({ expiresAt: EXPIRED, storagePath });
    const notExpired = makeSighting({ expiresAt: NOT_EXPIRED });
    await repo.create(expired);
    await repo.create(notExpired);

    const svc = new AudioSessionCleanupService(repo, store, { logger: { warn() {}, info() {} } });
    const result = await svc.runOnce(NOW);

    assert.equal(result.deleted, 1);
    assert.equal(result.fileDeleteFailures, 0);
    assert.equal(await repo.get(expired.id), null, "만료된 행은 지워져야 함");
    assert.ok(await repo.get(notExpired.id), "안 만료된 행은 남아야 함");
    assert.equal(await store.read(storagePath), null, "파일도 실제로 지워져야 함");
  });
});

test("storagePath가 없는(품질 거부) 만료 세션은 파일 삭제 없이 바로 행만 지운다", async () => {
  await withTempDir(async (dir) => {
    const store = new AudioTempStore(dir);
    const repo = new InMemoryAudioSightingRepo();
    const rejected = makeSighting({ expiresAt: EXPIRED, status: "rejected", storagePath: undefined });
    await repo.create(rejected);

    const svc = new AudioSessionCleanupService(repo, store, { logger: { warn() {}, info() {} } });
    const result = await svc.runOnce(NOW);

    assert.equal(result.deleted, 1);
    assert.equal(result.fileDeleteFailures, 0);
    assert.equal(await repo.get(rejected.id), null);
  });
});

test("파일 삭제가 실패하면(진짜 실패) 이번엔 행을 지우지 않고 다음 스윕을 위해 남긴다", async () => {
  await withTempDir(async (dir) => {
    const store = new AudioTempStore(dir);
    // delete()를 오버라이드해 "진짜 실패"(ENOENT 아닌 에러)를 흉내낸다 — 실제 권한 에러를
    // 크로스플랫폼으로 재현하는 건 신뢰할 수 없어(특히 Windows) 직접 주입한다.
    const originalDelete = store.delete.bind(store);
    let deleteCalls = 0;
    store.delete = async (path: string) => {
      deleteCalls++;
      throw new Error("EACCES: 흉내낸 권한 실패");
    };

    const repo = new InMemoryAudioSightingRepo();
    const sighting = makeSighting({ expiresAt: EXPIRED, storagePath: "some-file.wav" });
    await repo.create(sighting);

    const warnings: string[] = [];
    const svc = new AudioSessionCleanupService(repo, store, {
      logger: { warn: (msg: string) => warnings.push(msg), info() {} },
    });
    const result = await svc.runOnce(NOW);

    assert.equal(result.deleted, 0, "파일 삭제 실패면 행도 안 지워져야 함");
    assert.equal(result.fileDeleteFailures, 1);
    assert.equal(deleteCalls, 1);
    assert.ok(await repo.get(sighting.id), "다음 스윕이 재시도할 수 있게 행이 남아있어야 함");
    assert.ok(warnings.some((w) => w.includes(sighting.id)), "실패가 로그로 남아야 함(모니터링)");

    // 원상복구: 두 번째 스윕에서 파일 삭제가 성공하면 그제서야 행도 지워진다(재시도 확인).
    store.delete = originalDelete;
    const secondResult = await svc.runOnce(NOW);
    assert.equal(secondResult.deleted, 1);
    assert.equal(await repo.get(sighting.id), null);
  });
});

test("batchLimit을 넘는 만료 건은 이번 스윕에서 일부만 처리한다", async () => {
  await withTempDir(async (dir) => {
    const store = new AudioTempStore(dir);
    const repo = new InMemoryAudioSightingRepo();
    for (let i = 0; i < 5; i++) {
      await repo.create(makeSighting({ expiresAt: EXPIRED }));
    }
    const svc = new AudioSessionCleanupService(repo, store, {
      batchLimit: 2,
      logger: { warn() {}, info() {} },
    });
    const result = await svc.runOnce(NOW);
    assert.equal(result.deleted, 2, "batchLimit(2)만큼만 처리해야 함");
  });
});

test("start/stop: 타이머를 걸고 해제할 수 있다(실제 주기 실행 없이 API만 확인)", async () => {
  await withTempDir(async (dir) => {
    const store = new AudioTempStore(dir);
    const repo = new InMemoryAudioSightingRepo();
    const svc = new AudioSessionCleanupService(repo, store, { logger: { warn() {}, info() {} } });
    svc.start(60_000);
    svc.start(60_000); // 중복 호출해도 안전해야 함(에러 없음)
    svc.stop();
    svc.stop(); // 중복 stop도 안전해야 함
  });
});
