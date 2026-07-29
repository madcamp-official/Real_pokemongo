/**
 * 골든 테스트: 오디오 변환기 (실제 로컬 ffmpeg 필요 — CI/개발 환경에 설치돼 있어야 함).
 * 핵심 불변식:
 *  - M4A/WAV 입력을 48kHz mono PCM WAV로 바꾼다(BirdNET 요구사항, SPIKE_REPORT.md).
 *  - 미지 포맷은 ffmpeg를 실행하지도 않고 거부한다.
 *  - 손상/디코딩 불가 입력은 decode_failed로 거부한다.
 *  - 허용 길이를 넘는 오디오는 자르지 않고 too_long으로 거부한다.
 *  - 타임아웃을 넘기면 timeout으로 거부하고, 자식 프로세스가 남지 않는다.
 *  - 성공/실패 관계없이 임시 파일을 정리한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AudioConverter, AudioConversionError } from "./AudioConverter.js";
import { UnsupportedAudioFormatError } from "./AudioSignature.js";
import { makeRealAudio } from "./fixtures.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "seed-audio-converter-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("M4A(AAC) 입력을 48kHz mono PCM WAV로 변환한다", async () => {
  await withTempDir(async (tempDir) => {
    const converter = new AudioConverter({ tempDir, maxDurationSeconds: 15, timeoutMs: 10_000 });
    const input = await makeRealAudio({ seconds: 4, format: "m4a", sampleRate: 44100, channels: 2 });
    const result = await converter.convertToMonoPcmWav(input);
    assert.equal(result.sampleRate, 48000);
    assert.ok(Math.abs(result.durationMs - 4000) < 100, `durationMs=${result.durationMs}`);
    // 임시 입출력 파일이 남지 않아야 한다.
    assert.deepEqual(await readdir(tempDir), []);
  });
});

test("WAV 입력도 mono 48kHz로 재인코딩한다", async () => {
  await withTempDir(async (tempDir) => {
    const converter = new AudioConverter({ tempDir, maxDurationSeconds: 15, timeoutMs: 10_000 });
    const input = await makeRealAudio({ seconds: 2, format: "wav", sampleRate: 44100, channels: 2 });
    const result = await converter.convertToMonoPcmWav(input);
    assert.equal(result.sampleRate, 48000);
    assert.ok(Math.abs(result.durationMs - 2000) < 100, `durationMs=${result.durationMs}`);
  });
});

test("미지 포맷은 ffmpeg 실행 없이 즉시 거부한다", async () => {
  await withTempDir(async (tempDir) => {
    const converter = new AudioConverter({ tempDir, maxDurationSeconds: 15, timeoutMs: 10_000 });
    const garbage = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    await assert.rejects(() => converter.convertToMonoPcmWav(garbage), UnsupportedAudioFormatError);
    // ffmpeg를 아예 안 돌렸으므로 temp 파일도 안 만들어져야 한다.
    assert.deepEqual(await readdir(tempDir), []);
  });
});

test("RIFF/WAVE 헤더만 있고 실제 오디오 데이터가 없는 손상 파일은 decode_failed로 거부한다", async () => {
  await withTempDir(async (tempDir) => {
    const converter = new AudioConverter({ tempDir, maxDurationSeconds: 15, timeoutMs: 10_000 });
    // 시그니처 검사는 통과하지만(RIFF/WAVE) ffmpeg가 디코딩할 수 없는 손상 바이트.
    const corrupt = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0xff, 0xff, 0xff, 0x7f, 0x57, 0x41, 0x56, 0x45,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    await assert.rejects(
      () => converter.convertToMonoPcmWav(corrupt),
      (err: unknown) => err instanceof AudioConversionError && err.code === "decode_failed",
    );
    assert.deepEqual(await readdir(tempDir), []);
  });
});

test("허용 길이를 넘는 오디오는 자르지 않고 too_long으로 거부한다", async () => {
  await withTempDir(async (tempDir) => {
    const converter = new AudioConverter({ tempDir, maxDurationSeconds: 3, timeoutMs: 15_000 });
    const input = await makeRealAudio({ seconds: 6, format: "wav", sampleRate: 44100, channels: 1 });
    await assert.rejects(
      () => converter.convertToMonoPcmWav(input),
      (err: unknown) => err instanceof AudioConversionError && err.code === "too_long",
    );
    assert.deepEqual(await readdir(tempDir), []);
  });
});

test("타임아웃을 넘기면 timeout으로 거부하고 임시 파일을 정리한다", async () => {
  await withTempDir(async (tempDir) => {
    // 실제 변환이 절대 못 끝낼 만큼 짧은 타임아웃 — ffmpeg 프로세스 기동 자체보다 짧다.
    const converter = new AudioConverter({ tempDir, maxDurationSeconds: 15, timeoutMs: 1 });
    const input = await makeRealAudio({ seconds: 5, format: "wav", sampleRate: 44100, channels: 1 });
    await assert.rejects(
      () => converter.convertToMonoPcmWav(input),
      (err: unknown) => err instanceof AudioConversionError && err.code === "timeout",
    );
    assert.deepEqual(await readdir(tempDir), []);
  });
});
