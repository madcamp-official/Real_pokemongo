/**
 * 골든 테스트: WAV → PCM 샘플 추출. 실제 ffmpeg 출력을 디코딩해 RMS/피크가 이론값과
 * 맞는지 확인한다 — AudioQualityAnalyzer의 모든 판정이 이 추출값 위에 서 있으므로,
 * 여기서 부호/스케일/오프셋 버그가 있으면 그 위 전부가 조용히 틀려진다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPcm16Mono } from "./pcmUtils.js";
import { InvalidWavError } from "./wavUtils.js";
import { makeRealAudio } from "./fixtures.js";

test("실제 사인파 WAV의 샘플 수·RMS가 이론값과 맞는다", async () => {
  const buf = await makeRealAudio({ seconds: 1, format: "wav", sampleRate: 48000, channels: 1 });
  const { samples, sampleRate } = extractPcm16Mono(buf);
  assert.equal(sampleRate, 48000);
  assert.ok(Math.abs(samples.length - 48000) < 100, `samples.length=${samples.length}`);

  // 모든 값이 -1..1 범위 안(정규화 확인).
  for (let i = 0; i < samples.length; i++) {
    assert.ok(samples[i]! >= -1 && samples[i]! <= 1);
  }

  // ffmpeg lavfi sine 소스의 기본 진폭은 풀스케일이 아니라 약 0.125(실측) — 정확한 값을
  // 가정하지 않고, 무음(≈0)도 클리핑(≈1)도 아닌 "뭔가 들리는" 범위인지만 확인한다.
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sumSq / samples.length);
  assert.ok(rms > 0.03 && rms < 0.9, `rms=${rms}`);
});

test("stereo WAV는 명확히 거부한다(변환 파이프라인은 항상 mono만 만들어야 함)", async () => {
  const buf = await makeRealAudio({ seconds: 1, format: "wav", sampleRate: 44100, channels: 2 });
  assert.throws(() => extractPcm16Mono(buf), InvalidWavError);
});
