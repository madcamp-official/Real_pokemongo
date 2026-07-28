/**
 * 골든 테스트: WAV 헤더 파싱.
 * 핵심 불변식:
 *  - 실제 ffmpeg가 만든 WAV의 샘플레이트/채널/길이를 정확히 읽어낸다.
 *  - RIFF/WAVE가 아니면 거부한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWavInfo, InvalidWavError } from "./wavUtils.js";
import { makeRealAudio } from "./fixtures.js";

test("실제 mono 48kHz WAV의 길이/샘플레이트를 정확히 읽는다", async () => {
  const buf = await makeRealAudio({ seconds: 3, format: "wav", sampleRate: 48000, channels: 1 });
  const info = parseWavInfo(buf);
  assert.equal(info.sampleRate, 48000);
  assert.equal(info.numChannels, 1);
  assert.equal(info.bitsPerSample, 16);
  // ffmpeg가 만드는 실제 샘플 수는 초 단위와 딱 안 맞을 수 있어 약간의 오차를 허용한다.
  assert.ok(Math.abs(info.durationMs - 3000) < 50, `durationMs=${info.durationMs}`);
});

test("stereo/44.1kHz도 정확히 읽는다", async () => {
  const buf = await makeRealAudio({ seconds: 2, format: "wav", sampleRate: 44100, channels: 2 });
  const info = parseWavInfo(buf);
  assert.equal(info.sampleRate, 44100);
  assert.equal(info.numChannels, 2);
  assert.ok(Math.abs(info.durationMs - 2000) < 50, `durationMs=${info.durationMs}`);
});

test("RIFF/WAVE가 아니면 거부한다", () => {
  assert.throws(() => parseWavInfo(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), InvalidWavError);
});
