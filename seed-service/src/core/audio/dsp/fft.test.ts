/**
 * 골든 테스트: FFT 구현 자체의 수치적 정확성. AudioQualityAnalyzer의 모든 스펙트럼 기반
 * 검사(TOO_NOISY/SPEECH_DETECTED/MULTIPLE_OVERLAP/UNSUPPORTED_SOUND)가 이 위에 서 있으므로,
 * 여기서 버그가 있으면 그 위의 모든 판정이 조용히 틀려진다 — 반드시 독립적으로 검증한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fftInPlace, magnitudeSpectrum, binToHz, hzToBin, nextPow2 } from "./fft.js";

test("nextPow2: 이미 2의 거듭제곱이면 그대로, 아니면 올림", () => {
  assert.equal(nextPow2(1024), 1024);
  assert.equal(nextPow2(1000), 1024);
  assert.equal(nextPow2(1), 1);
  assert.equal(nextPow2(2), 2);
});

test("순수 톤(1kHz, 48kHz 샘플링, 1024 프레임)의 피크가 기대 bin에 나타난다", () => {
  const sampleRate = 48000;
  const frameSize = 1024;
  const freq = 1000;
  const frame = new Float64Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    frame[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  const mags = magnitudeSpectrum(frame);

  let peakBin = 0;
  let peakMag = -Infinity;
  for (let i = 0; i < mags.length; i++) {
    if (mags[i]! > peakMag) {
      peakMag = mags[i]!;
      peakBin = i;
    }
  }
  const expectedBin = hzToBin(freq, frameSize, sampleRate);
  assert.ok(
    Math.abs(peakBin - expectedBin) <= 1,
    `피크 bin=${peakBin}, 기대 bin=${expectedBin}`,
  );
  // bin↔Hz 왕복 변환도 검증
  assert.ok(Math.abs(binToHz(expectedBin, frameSize, sampleRate) - freq) < (sampleRate / frameSize));
});

test("DC(상수) 신호는 0번 bin에만 에너지가 몰린다", () => {
  const frame = new Float64Array(64).fill(1);
  const mags = magnitudeSpectrum(frame);
  assert.ok(mags[0]! > 0);
  for (let i = 1; i < mags.length; i++) {
    assert.ok(mags[i]! < 1e-9, `bin ${i}에 예상 밖 에너지: ${mags[i]}`);
  }
});

test("Parseval 정리: 시간영역 에너지 합 = 주파수영역 에너지 합 / N", () => {
  const n = 256;
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  // 재현 가능한 의사난수(테스트 흔들림 방지) — 특정 시드 기반 간단 LCG.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < n; i++) real[i] = rand() * 2 - 1;

  let timeEnergy = 0;
  for (let i = 0; i < n; i++) timeEnergy += real[i]! * real[i]!;

  fftInPlace(real, imag);

  let freqEnergy = 0;
  for (let i = 0; i < n; i++) freqEnergy += real[i]! * real[i]! + imag[i]! * imag[i]!;
  freqEnergy /= n;

  const relError = Math.abs(freqEnergy - timeEnergy) / timeEnergy;
  assert.ok(relError < 1e-9, `상대오차=${relError} (time=${timeEnergy}, freq=${freqEnergy})`);
});

test("2의 거듭제곱이 아닌 길이는 명확히 거부한다", () => {
  const real = new Float64Array(100);
  const imag = new Float64Array(100);
  assert.throws(() => fftInPlace(real, imag), /2의 거듭제곱/);
});
