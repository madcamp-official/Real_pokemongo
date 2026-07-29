/**
 * 골든 테스트: 오디오 임시 저장소.
 * 핵심 불변식:
 *  - save() 한 바이트를 read()로 그대로 되찾는다.
 *  - 존재하지 않는 storagePath를 read()하면 null(예외 아님).
 *  - delete()는 이미 없는 파일이면 조용히 성공하고(ENOENT), 그 외 진짜 실패(권한 등)는
 *    예외를 던진다 — AudioSessionCleanupService의 "재시도" 판단이 이 구분에 의존한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AudioTempStore } from "./AudioTempStore.js";

async function withStore(fn: (store: AudioTempStore, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "seed-audio-tempstore-test-"));
  try {
    await fn(new AudioTempStore(dir), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("save한 바이트를 read로 그대로 되찾는다", async () => {
  await withStore(async (store) => {
    const bytes = Buffer.from("가짜 WAV 바이트");
    const path = await store.save(bytes);
    const read = await store.read(path);
    assert.deepEqual(read, bytes);
  });
});

test("존재하지 않는 storagePath를 read하면 null(예외 아님)", async () => {
  await withStore(async (store) => {
    const read = await store.read(`${randomUUID()}.wav`);
    assert.equal(read, null);
  });
});

test("delete: 존재하지 않는 파일은 조용히 성공(ENOENT는 실패가 아니다)", async () => {
  await withStore(async (store) => {
    await assert.doesNotReject(() => store.delete(`${randomUUID()}.wav`));
  });
});

test("delete: 실제로 저장된 파일을 지우면 이후 read가 null을 반환한다", async () => {
  await withStore(async (store) => {
    const path = await store.save(Buffer.from("x"));
    await store.delete(path);
    assert.equal(await store.read(path), null);
  });
});
