/**
 * 골든 테스트: 4단계 품질 분석기. 8개 feedback_codes 전부를 실제로 재현 가능한 합성/실제
 * 신호(fixtures.ts)로 하나씩 검증한다 — 임계값 근거는 AudioQualityAnalyzer.ts 상단 주석의
 * 실측 보정 결과.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioQualityAnalyzer } from "./AudioQualityAnalyzer.js";
import { parseWavInfo } from "./wavUtils.js";
import {
  makeRealAudio,
  makeSilence,
  makeWhiteNoise,
  makeTone,
  makeClippedTone,
  makeChirp,
  makeMixedTones,
  makeRealSpeech,
} from "./fixtures.js";

const analyzer = new AudioQualityAnalyzer();

async function analyzeWav(wavBytes: Buffer) {
  const info = parseWavInfo(wavBytes);
  return analyzer.analyze({ wavBytes, durationMs: info.durationMs });
}

test("정상 녹음(활동/조용한 구간이 섞인 처프)은 usable=true, feedback_codes=[]", async () => {
  // 실제 새소리 녹음을 흉내낸 형태 — 주파수가 변하는 소리(처프, 고정 톤이 아님)가 여러 번
  // 등장하고 사이사이 조용한 구간이 있다. 끊김 없는 단일 순음은 일부러 안 쓴다 — 그건
  // UNSUPPORTED_SOUND 전용 테스트의 대상이고, 조용한 대조군이 아예 없으면 SNR 추정 자체가
  // 성립하지 않는 비현실적인 입력이다(AudioQualityAnalyzer.ts 상단 주석 참고).
  const wav = await makeChirp(6, 1500, 300);
  const q = await analyzeWav(wav);
  assert.equal(q.usable, true, JSON.stringify(q.feedbackCodes));
  assert.deepEqual(q.feedbackCodes, []);
  assert.ok(q.validSegments.length > 0);
  assert.ok(Math.abs(q.durationMs - 6000) < 100);
});

test("TOO_SHORT: 3초 미만은 다른 분석 없이 즉시 거부", async () => {
  const wav = await makeTone(2, 2500, 6);
  const info = parseWavInfo(wav);
  const q = analyzer.analyze({ wavBytes: wav, durationMs: info.durationMs });
  assert.equal(q.usable, false);
  assert.deepEqual(q.feedbackCodes, ["TOO_SHORT"]);
  assert.deepEqual(q.validSegments, []);
});

test("MOSTLY_SILENCE: 진짜 무음은 거부되고 valid_segments가 비어있다", async () => {
  const wav = await makeSilence(5);
  const q = await analyzeWav(wav);
  assert.equal(q.usable, false);
  assert.ok(q.feedbackCodes.includes("MOSTLY_SILENCE"), JSON.stringify(q.feedbackCodes));
  assert.deepEqual(q.validSegments, []);
  assert.ok(q.silenceRatio > 0.85);
});

test("CLIPPED: 풀스케일을 넘겨 저장된 톤은 clipping_ratio가 임계값을 넘는다", async () => {
  const wav = await makeClippedTone(5);
  const q = await analyzeWav(wav);
  assert.ok(q.feedbackCodes.includes("CLIPPED"), JSON.stringify(q.feedbackCodes));
  assert.ok(q.clippingRatio > 0.005, `clippingRatio=${q.clippingRatio}`);
  assert.equal(q.usable, false);
});

test("TOO_NOISY: 시끄러운 백색잡음은 SNR이 낮게 잡혀 거부된다", async () => {
  const wav = await makeWhiteNoise(5, 0.5);
  const q = await analyzeWav(wav);
  assert.ok(q.feedbackCodes.includes("TOO_NOISY"), JSON.stringify(q.feedbackCodes) + ` snr=${q.snrDb}`);
  assert.equal(q.usable, false);
});

test("SPEECH_DETECTED: 실제 사람 음성(TTS) 2건 모두 거부되고, 톤/처프는 걸리지 않는다", async () => {
  const speech1 = await analyzeWav(
    await makeRealSpeech("The quick brown fox jumps over the lazy dog near the river."),
  );
  assert.ok(speech1.feedbackCodes.includes("SPEECH_DETECTED"), JSON.stringify(speech1));
  assert.equal(speech1.usable, false);

  const speech2 = await analyzeWav(
    await makeRealSpeech("Please remember to bring your umbrella tomorrow afternoon."),
  );
  assert.ok(speech2.feedbackCodes.includes("SPEECH_DETECTED"), JSON.stringify(speech2));

  // 거짓 양성 방지: 순음/처프는 SPEECH_DETECTED가 걸리면 안 된다.
  const tone = await analyzeWav(await makeTone(4, 2500, 6));
  assert.ok(!tone.feedbackCodes.includes("SPEECH_DETECTED"), JSON.stringify(tone));
  const chirp = await analyzeWav(await makeChirp(4, 1500, 800));
  assert.ok(!chirp.feedbackCodes.includes("SPEECH_DETECTED"), JSON.stringify(chirp));
});

test("음성 우세 파일은 BirdNET에 전달될 여지가 없다(usable=false, valid_segments=[])", async () => {
  const q = await analyzeWav(
    await makeRealSpeech("This sentence is definitely spoken by a human voice, not a bird."),
  );
  assert.equal(q.usable, false);
  assert.deepEqual(q.validSegments, []);
});

test("UNSUPPORTED_SOUND: 주파수가 고정된 지속음(순음)은 걸리고, 처프(주파수 변조)는 안 걸린다", async () => {
  const tone = await analyzeWav(await makeTone(5, 2500, 6));
  assert.ok(tone.feedbackCodes.includes("UNSUPPORTED_SOUND"), JSON.stringify(tone.feedbackCodes));

  const chirp = await analyzeWav(await makeChirp(5, 1500, 800));
  assert.ok(!chirp.feedbackCodes.includes("UNSUPPORTED_SOUND"), JSON.stringify(chirp.feedbackCodes));
});

test("MULTIPLE_OVERLAP: 배음 관계가 아닌 두 톤이 겹치면 걸리고, 배음 관계(정수배)는 안 걸린다", async () => {
  const unrelated = await analyzeWav(await makeMixedTones(5, 800, 2600));
  assert.ok(unrelated.feedbackCodes.includes("MULTIPLE_OVERLAP"), JSON.stringify(unrelated.feedbackCodes));

  const harmonic = await analyzeWav(await makeMixedTones(5, 1000, 2000));
  assert.ok(!harmonic.feedbackCodes.includes("MULTIPLE_OVERLAP"), JSON.stringify(harmonic.feedbackCodes));
});

test("NO_TARGET_ACTIVITY: 무음은 아니지만 유의미한 연속 활동 구간이 없으면 거부된다", async () => {
  // 0.4초 주기로 0.15초씩만 소리 나는 신호: 전체 활동 비율은 약 37.5%라 MOSTLY_SILENCE(0.85
  // 초과)엔 안 걸리지만, 각 활동 구간(~0.15초)이 최소 유효 구간(300ms)보다 짧아 하나도 valid
  // segment로 안 잡혀야 한다.
  const dir = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { spawn } = await import("node:child_process");
  const tmp = await dir.mkdtemp(path.join(os.tmpdir(), "seed-audio-fixture-"));
  const outPath = path.join(tmp, "clicks.wav");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i",
      "aevalsrc=0.9*sin(2*PI*3000*t)*lt(mod(t\\,0.4)\\,0.15):s=48000:d=8",
      "-ac", "1", "-ar", "48000", "-acodec", "pcm_s16le",
      outPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
  });
  const wav = await dir.readFile(outPath);
  await dir.rm(tmp, { recursive: true, force: true });

  const q = await analyzeWav(wav);
  assert.ok(!q.feedbackCodes.includes("MOSTLY_SILENCE"), `silenceRatio=${q.silenceRatio}, codes=${JSON.stringify(q.feedbackCodes)}`);
  assert.ok(q.feedbackCodes.includes("NO_TARGET_ACTIVITY"), JSON.stringify(q));
  assert.equal(q.usable, false);
});

test("실제 ffmpeg 합성음(makeRealAudio 기본 사인)도 정상 처리된다(회귀: 3단계 픽스처와 호환)", async () => {
  const wav = await makeRealAudio({ seconds: 4, format: "wav", sampleRate: 48000, channels: 1 });
  const q = await analyzeWav(wav);
  // makeRealAudio는 볼륨 지정 없이 기본 진폭(조용함)이라 무음으로 잡힐 수 있음 — 어느 쪽이든
  // 분석기가 예외 없이 완료되고 스키마가 항상 채워지는지만 확인(임계값 자체는 각 전용 테스트가 검증).
  assert.equal(typeof q.usable, "boolean");
  assert.equal(typeof q.silenceRatio, "number");
  assert.equal(typeof q.clippingRatio, "number");
  assert.equal(typeof q.speechRatio, "number");
});
