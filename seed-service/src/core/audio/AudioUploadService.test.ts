/**
 * 골든 테스트: 오디오 업로드 오케스트레이션.
 * 핵심 불변식:
 *  - 성공하면 status='ready'인 audio_sighting을 만들고 저장소에 실제로 남긴다.
 *  - 같은 (userId, client_recording_id) 재요청은 재변환 없이 같은 결과를 돌려준다(멱등성).
 *  - quality는 4단계(AudioQualityAnalyzer)의 실제 신호분석 결과다.
 *  - 품질 거부(usable=false)면 status='rejected'이고, 오디오 바이트는 저장하지 않는다
 *    (storagePath 없음) — 디스크에 실제 파일이 안 남는지까지 확인한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AudioConverter } from "./AudioConverter.js";
import { AudioTempStore } from "./AudioTempStore.js";
import { AudioUploadService } from "./AudioUploadService.js";
import { InMemoryAudioSightingRepo } from "../repositories/memory/InMemoryRepositories.js";
import { makeRealAudio, makeSilence } from "./fixtures.js";
import type { UserId } from "../domain/types.js";

async function withService(
  fn: (svc: AudioUploadService, repo: InMemoryAudioSightingRepo, tempDir: string) => Promise<void>,
) {
  const tempDir = await mkdtemp(join(tmpdir(), "seed-audio-upload-test-"));
  try {
    const converter = new AudioConverter({ tempDir, maxDurationSeconds: 15, timeoutMs: 10_000 });
    const store = new AudioTempStore(tempDir);
    const repo = new InMemoryAudioSightingRepo();
    const svc = new AudioUploadService(converter, store, repo, { ttlHours: 24 });
    await fn(svc, repo, tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("성공 업로드는 ready 상태의 audio_sighting을 만든다", async () => {
  await withService(async (svc, repo) => {
    const userId = randomUUID() as UserId;
    const audioBytes = await makeRealAudio({ seconds: 4, format: "m4a" });
    const sighting = await svc.upload({
      userId,
      clientRecordingId: randomUUID(),
      audioBytes,
      clientDurationMs: 4000,
      recordedAt: new Date().toISOString(),
    });

    assert.equal(sighting.status, "ready");
    assert.equal(sighting.quality.usable, true);
    assert.deepEqual(sighting.quality.feedbackCodes, []);
    assert.ok(Math.abs(sighting.quality.durationMs - 4000) < 100);
    assert.ok(sighting.storagePath, "저장 경로가 있어야 함");

    const stored = await repo.get(sighting.id);
    assert.ok(stored, "저장소에 실제로 남아야 함");
    assert.equal(stored!.userId, userId);
  });
});

test("같은 client_recording_id로 재요청하면 재변환 없이 같은 sighting을 돌려준다", async () => {
  await withService(async (svc, repo) => {
    const userId = randomUUID() as UserId;
    const clientRecordingId = randomUUID();
    const audioBytes = await makeRealAudio({ seconds: 3, format: "wav" });

    const first = await svc.upload({
      userId,
      clientRecordingId,
      audioBytes,
      clientDurationMs: 3000,
      recordedAt: new Date().toISOString(),
    });
    const second = await svc.upload({
      userId,
      clientRecordingId,
      audioBytes,
      clientDurationMs: 3000,
      recordedAt: new Date().toISOString(),
    });

    assert.equal(second.id, first.id);
    assert.equal(second.createdAt, first.createdAt);

    // 저장소에 딱 1건만 있어야 한다(재처리로 중복 생성되지 않음).
    const all = await repo.deleteByUser(userId);
    assert.equal(all, 1);
  });
});

test("품질 거부(무음)면 status='rejected'이고 오디오 바이트를 디스크에 저장하지 않는다", async () => {
  await withService(async (svc, repo, tempDir) => {
    const userId = randomUUID() as UserId;
    const audioBytes = await makeSilence(5);
    const sighting = await svc.upload({
      userId,
      clientRecordingId: randomUUID(),
      audioBytes,
      clientDurationMs: 5000,
      recordedAt: new Date().toISOString(),
    });

    assert.equal(sighting.status, "rejected");
    assert.equal(sighting.quality.usable, false);
    assert.ok(sighting.quality.feedbackCodes.includes("MOSTLY_SILENCE"));
    assert.equal(sighting.storagePath, undefined, "거부된 오디오는 저장 경로가 없어야 함");

    const stored = await repo.get(sighting.id);
    assert.ok(stored, "판정 결과 자체는 저장소에 남아야 함(재시도 멱등성/삭제 대상 추적)");

    // AudioConverter의 임시 입출력 파일은 항상 정리되므로(finally), 거부된 업로드 후
    // tempDir에 남는 파일이 있다면 그건 AudioTempStore.save()가 실제로 호출됐다는 뜻이다
    // — 하나도 없어야 "바이트를 저장하지 않는다"는 게 실제로 지켜진 것이다.
    const files = await readdir(tempDir);
    assert.deepEqual(files, [], `tempDir에 남은 파일: ${files.join(", ")}`);
  });
});

test("지원하지 않는 포맷은 그대로 예외를 던진다(호출부가 매핑)", async () => {
  await withService(async (svc) => {
    const userId = randomUUID() as UserId;
    await assert.rejects(() =>
      svc.upload({
        userId,
        clientRecordingId: randomUUID(),
        audioBytes: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        clientDurationMs: 3000,
        recordedAt: new Date().toISOString(),
      }),
    );
  });
});
