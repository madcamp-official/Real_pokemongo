/**
 * 4단계(품질 검사와 음성 보호) — doc 03 7장의 검사 순서(길이→무음→클리핑→SNR→사람 음성→
 * 목표 음향 활동 구간→중첩)를 실제 신호분석으로 구현한다. 별도 ML 모델 없이 순수 DSP
 * 휴리스틱이라, 모든 임계값은 `_calibrate_scratch.ts`(일회성 보정 스크립트, 실행 후 삭제)로
 * 실측한 값을 근거로 정했다 — 추측이 아니라 아래 실제 측정 결과를 바탕으로 한다:
 *
 *   무음(anullsrc)              → 항상 -45dBFS 미만
 *   조용한 룸톤(백색잡음 a=0.003) → -45dBFS 미만(무음으로 정확히 분류됨)
 *   시끄러운 잡음(백색잡음 a=0.5) → flatnessFull≈0.85(매우 평탄), peakHzStd≈6900Hz(피크가 프레임마다 무작위)
 *   깨끗한 톤(2500Hz)            → peakHzStd=0(완전히 고정), secondPeakRatio≈0.09(2번째 피크 없음)
 *   클리핑된 톤(+24dB 증폭)      → clippingRatio≈0.625(임계값 0.005를 압도적으로 초과)
 *   처프(주파수 스윕)            → peakHzStd≈2300Hz(비정상적으로 안 고정 — 새소리다운 주파수 변조의 대리 신호)
 *   무관한 두 톤 중첩(800+2600Hz) → secondPeakRatio≈0.68 & 배음 관계 아님(비율 3.25, 정수 근처 아님)
 *   배음 관계 두 톤(1000+2000Hz)  → secondPeakRatio≈0.99지만 배음 관계(정확히 2배)라 중첩으로 안 침
 *   실제 사람 음성(Windows SAPI, 서로 다른 문장 2건) → 음절 리듬(진폭 변조 스펙트�럼 3-8Hz) 비중 0.52~0.57,
 *     그 외 모든 비-음성 샘플은 전부 0.34 이하 — 이 값 하나가 음성/비음성을 가장 깨끗하게 갈랐다
 *     (애초에 가정했던 "300-3400Hz 대역 에너지 비중"은 톤/화음이 오히려 그 대역에 몰려 있어서
 *     실측 결과 완전히 반대로 나왔다 — 가정을 버리고 실측으로 대체한 사례).
 *
 * 표본이 적은 휴리스틱이라는 한계는 있다(진짜 새소리 녹음으로 검증한 게 아니라 합성음/실제
 * TTS 음성으로 검증함) — 실제 배포 후 오탐/누락이 보이면 이 파일의 상수부터 재보정할 것.
 */
import { extractPcm16Mono } from "./pcmUtils.js";
import { magnitudeSpectrum, nextPow2 } from "./dsp/fft.js";
import type { AudioFeedbackCode, AudioQuality, AudioQualityValidSegment } from "./audioTypes.js";

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;

/** DECISIONS.md "Recording duration: Minimum 3 seconds". */
const MIN_DURATION_MS = 3000;

/** 프레임 RMS가 이 dBFS 미만이면 "무음"으로 본다(실측: 진짜 무음/조용한 룸톤 모두 이 아래). */
const SILENCE_DBFS = -45;
/** 전체 프레임 중 무음 비율이 이 값을 넘으면 거부. */
const MOSTLY_SILENCE_RATIO = 0.85;

/** 풀스케일(±32768) 대비 이 값 이상이면 "클리핑된 샘플"로 센다. */
const CLIP_SAMPLE_THRESHOLD = 32700 / 32768;
/** upload-success.json 기준 통과 예시(0.001)보다 확실히 높게 잡은 거부 임계값. */
const CLIPPING_RATIO_THRESHOLD = 0.005;

/** 문헌상 자동 종 동정에 쓸 만한 최소 SNR 어림값(신뢰 여유를 두고 success 예시의 17.4dB보다 낮게). */
const TOO_NOISY_SNR_DB_THRESHOLD = 10;
/** 활성/비활성 프레임을 각각 최소 이만큼은 확보해야 "조용한 구간 대비 신호" SNR을 신뢰할 수 있다. */
const MIN_FRAMES_FOR_CONTRAST_SNR = 3;
/** 녹음 전체가 끊김 없이 활동적이라 조용한 구간이 없을 때(=대비 기반 SNR을 못 잴 때)의 대체 판단:
 * 실측 - 시끄러운 백색잡음 flatnessFull≈0.85, 반면 순음/화음/처프/음성은 전부 0.07~0.31. */
const FLATNESS_NOISY_FALLBACK_THRESHOLD = 0.6;

/** 실측: 실제 사람 음성 2건 모두 0.52 이상, 그 외 모든 비음성 샘플은 0.34 이하 — 그 사이에서 여유있게. */
const SPEECH_MODULATION_RATIO_THRESHOLD = 0.42;

/** 실측: 고정 톤은 peakHzStd=0, 처프/음성/잡음은 전부 1000Hz 이상 — 배음 쌍(485Hz)도 배제할 만큼 낮게. */
const STATIONARY_PEAK_HZ_STD_THRESHOLD = 150;
/** 안정된 피크가 있어도 활동 구간이 너무 짧으면(우연한 순간음) UNSUPPORTED_SOUND로 안 본다. */
const MIN_STATIONARY_DURATION_MS = 1000;

/** 실측: 무관한 두 톤은 secondPeakRatio≈0.68, 배음 쌍은 0.99지만 배음관계라 별도로 걸러짐. */
const OVERLAP_SECOND_PEAK_RATIO = 0.5;
/** 두 피크 주파수 비율이 정수(2~5)에 이만큼(비율) 가까우면 "같은 소리의 배음"으로 보고 중첩에서 제외. */
const HARMONIC_RATIO_TOLERANCE = 0.05;
/** 우연히 한두 프레임만 겹친 것과 실제로 지속된 중첩을 구분. */
const OVERLAP_FRAME_RATIO_THRESHOLD = 0.5;

/** 이보다 짧은 활동 구간은 새소리 후보로 보기엔 너무 짧은 클릭/잡음으로 보고 valid_segments에서 뺀다. */
const MIN_VALID_SEGMENT_MS = 300;

/** `docs/audio/API_CONTRACT.md`가 나열한 순서 — 여러 코드가 동시에 해당해도 항상 이 순서로 보고한다. */
const FEEDBACK_CODE_ORDER: AudioFeedbackCode[] = [
  "TOO_SHORT",
  "MOSTLY_SILENCE",
  "TOO_NOISY",
  "CLIPPED",
  "SPEECH_DETECTED",
  "MULTIPLE_OVERLAP",
  "UNSUPPORTED_SOUND",
  "NO_TARGET_ACTIVITY",
];

function frameRms(frame: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  return Math.sqrt(sum / frame.length);
}

function toDbfs(rms: number): number {
  return rms <= 1e-9 ? -Infinity : 20 * Math.log10(rms);
}

/** 스펙트럼 평탄도(기하평균/산술평균, 0..1) — 1에 가까울수록 백색잡음처럼 평탄하고,
 * 0에 가까울수록 순음처럼 특정 주파수에 에너지가 몰려 있다("Wiener entropy"와 같은 개념). */
function spectralFlatness(mags: Float64Array, loBin: number, hiBin: number): number {
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let i = loBin; i <= hiBin; i++) {
    const m = Math.max(mags[i]!, 1e-12);
    logSum += Math.log(m);
    sum += m;
    n++;
  }
  const geoMean = Math.exp(logSum / n);
  const arithMean = sum / n;
  return geoMean / arithMean;
}

function isHarmonicallyRelated(freqA: number, freqB: number): boolean {
  const lo = Math.min(freqA, freqB);
  const hi = Math.max(freqA, freqB);
  if (lo < 1e-6) return false;
  const ratio = hi / lo;
  for (let k = 2; k <= 5; k++) {
    if (Math.abs(ratio - k) / k <= HARMONIC_RATIO_TOLERANCE) return true;
  }
  return false;
}

/** envelope(프레임별 RMS 시퀀스)의 변조 스펙트럼에서 사람 말소리 음절 리듬(3-8Hz) 비중. */
function speechModulationRatio(envelope: Float64Array, envelopeRate: number): number {
  const n = envelope.length;
  if (n < 8) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += envelope[i]!;
  mean /= n;

  const padded = new Float64Array(nextPow2(n));
  for (let i = 0; i < n; i++) padded[i] = envelope[i]! - mean; // DC 제거
  const mags = magnitudeSpectrum(padded);
  const binHz = envelopeRate / padded.length;
  const lo38 = Math.max(1, Math.round(3 / binHz));
  const hi38 = Math.max(lo38, Math.round(8 / binHz));
  const loTotal = Math.max(1, Math.round(0.5 / binHz));
  const hiTotal = Math.min(mags.length - 1, Math.round(20 / binHz));

  let e38 = 0;
  let eTotal = 0;
  for (let i = loTotal; i <= hiTotal; i++) {
    const e = mags[i]! * mags[i]!;
    eTotal += e;
    if (i >= lo38 && i <= hi38) e38 += e;
  }
  return eTotal > 1e-12 ? e38 / eTotal : 0;
}

export interface AudioQualityAnalysisInput {
  wavBytes: Uint8Array;
  /** AudioConverter가 실측한 값을 그대로 쓴다(다시 계산하지 않음 — 단일 출처 유지). */
  durationMs: number;
}

export class AudioQualityAnalyzer {
  analyze(input: AudioQualityAnalysisInput): AudioQuality {
    const { durationMs } = input;

    if (durationMs < MIN_DURATION_MS) {
      return {
        usable: false,
        durationMs,
        activeDurationMs: 0,
        snrDb: null,
        clippingRatio: 0,
        silenceRatio: 0,
        speechRatio: 0,
        feedbackCodes: ["TOO_SHORT"],
        validSegments: [],
      };
    }

    const { samples, sampleRate } = extractPcm16Mono(input.wavBytes);
    const nyquistBin = FRAME_SIZE / 2;

    // --- 클리핑(전체 샘플 기준) ---
    let clippedCount = 0;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]!) >= CLIP_SAMPLE_THRESHOLD) clippedCount++;
    }
    const clippingRatio = clippedCount / samples.length;

    // --- 프레임 단위 분석 ---
    const frameDbfs: number[] = [];
    const frameActive: boolean[] = [];
    const envelope: number[] = [];
    const framePower: number[] = [];
    const peakHzActive: number[] = [];
    let overlapFrameCount = 0;
    let activeFrameCount = 0;
    let flatnessSumActive = 0;

    for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
      const frame = samples.subarray(start, start + FRAME_SIZE);
      const rms = frameRms(frame);
      const dbfs = toDbfs(rms);
      frameDbfs.push(dbfs);
      envelope.push(rms);
      framePower.push(rms * rms);
      const active = dbfs > SILENCE_DBFS;
      frameActive.push(active);
      if (!active) continue;
      activeFrameCount++;

      const mags = magnitudeSpectrum(Float64Array.from(frame));
      flatnessSumActive += spectralFlatness(mags, 1, nyquistBin);
      let peak1Bin = 1;
      let peak1Mag = -Infinity;
      for (let i = 1; i <= nyquistBin; i++) {
        if (mags[i]! > peak1Mag) {
          peak1Mag = mags[i]!;
          peak1Bin = i;
        }
      }
      let peak2Mag = 0;
      let peak2Bin = 1;
      for (let i = 1; i <= nyquistBin; i++) {
        if (Math.abs(i - peak1Bin) <= 3) continue; // 같은 피크의 leakage 제외
        if (mags[i]! > peak2Mag) {
          peak2Mag = mags[i]!;
          peak2Bin = i;
        }
      }
      const peak1Hz = (peak1Bin * sampleRate) / FRAME_SIZE;
      const peak2Hz = (peak2Bin * sampleRate) / FRAME_SIZE;
      peakHzActive.push(peak1Hz);

      const secondPeakRatio = peak1Mag > 1e-9 ? peak2Mag / peak1Mag : 0;
      if (secondPeakRatio > OVERLAP_SECOND_PEAK_RATIO && !isHarmonicallyRelated(peak1Hz, peak2Hz)) {
        overlapFrameCount++;
      }
    }

    const totalFrames = frameActive.length;
    const silenceRatio = totalFrames > 0 ? 1 - activeFrameCount / totalFrames : 1;
    const activeDurationMs = Math.round((activeFrameCount * HOP_SIZE * 1000) / sampleRate);

    // --- SNR: 비활성(조용한) 프레임 대비 활성 프레임의 평균 파워 비 ---
    // 녹음 전체가 끊김 없이 활동적이면(조용한 대조군이 아예 없으면) 진폭 대비로는 잴 수 없다
    // — 이 경우 스펙트럼 평탄도로 대체 판단한다(순음처럼 에너지가 몰려 있으면 "시끄럽지 않음"으로
    // 보고 null, 백색잡음처럼 평탄하면 "시끄러움"으로 낮은 값을 매긴다). 실측 근거는 파일 상단 주석.
    const inactiveFrameCount = totalFrames - activeFrameCount;
    let snrDb: number | null;
    if (inactiveFrameCount >= MIN_FRAMES_FOR_CONTRAST_SNR && activeFrameCount >= MIN_FRAMES_FOR_CONTRAST_SNR) {
      let inactiveSum = 0;
      let activeSum = 0;
      for (let i = 0; i < totalFrames; i++) {
        if (frameActive[i]) activeSum += framePower[i]!;
        else inactiveSum += framePower[i]!;
      }
      const activeMeanPower = activeSum / activeFrameCount;
      const inactiveMeanPower = inactiveSum / inactiveFrameCount;
      snrDb = 10 * Math.log10(activeMeanPower / Math.max(inactiveMeanPower, 1e-12));
    } else if (activeFrameCount > 0) {
      const meanFlatnessActive = flatnessSumActive / activeFrameCount;
      snrDb = meanFlatnessActive > FLATNESS_NOISY_FALLBACK_THRESHOLD ? 0 : null;
    } else {
      snrDb = null;
    }

    // --- 음성 감지: 진폭 변조 스펙트럼의 3-8Hz 비중 ---
    const envelopeRate = sampleRate / HOP_SIZE;
    const speechRatio = speechModulationRatio(Float64Array.from(envelope), envelopeRate);

    // --- 고정 톤(주파수 변조 없는 지속음) 판정 ---
    let peakHzStd = 0;
    if (peakHzActive.length > 0) {
      const mean = peakHzActive.reduce((a, b) => a + b, 0) / peakHzActive.length;
      const variance = peakHzActive.reduce((a, b) => a + (b - mean) ** 2, 0) / peakHzActive.length;
      peakHzStd = Math.sqrt(variance);
    }
    const overlapFrameRatio = activeFrameCount > 0 ? overlapFrameCount / activeFrameCount : 0;
    const isStationaryTone =
      peakHzActive.length >= 8 &&
      peakHzStd < STATIONARY_PEAK_HZ_STD_THRESHOLD &&
      activeDurationMs >= MIN_STATIONARY_DURATION_MS &&
      overlapFrameRatio <= OVERLAP_FRAME_RATIO_THRESHOLD;

    // --- 목표 음향 활동 구간: 연속 활성 프레임을 세그먼트로 병합 ---
    const validSegments: AudioQualityValidSegment[] = [];
    let segStart = -1;
    const hopMs = (HOP_SIZE * 1000) / sampleRate;
    for (let i = 0; i <= frameActive.length; i++) {
      const active = i < frameActive.length && frameActive[i];
      if (active && segStart < 0) {
        segStart = i;
      } else if (!active && segStart >= 0) {
        const startMs = Math.round(segStart * hopMs);
        const endMs = Math.round((i - 1) * hopMs + (FRAME_SIZE * 1000) / sampleRate);
        if (endMs - startMs >= MIN_VALID_SEGMENT_MS) {
          let sum = 0;
          let count = 0;
          for (let f = segStart; f < i; f++) {
            sum += frameDbfs[f]!;
            count++;
          }
          const meanDbfs = count > 0 ? sum / count : SILENCE_DBFS;
          const qualityScore = Math.max(0, Math.min(1, (meanDbfs - SILENCE_DBFS) / (0 - SILENCE_DBFS)));
          validSegments.push({ startMs, endMs, qualityScore });
        }
        segStart = -1;
      }
    }

    // --- 판정 취합(순서는 무관 — 최종 출력 시 계약 순서로 재정렬) ---
    const hit = new Set<AudioFeedbackCode>();
    if (silenceRatio > MOSTLY_SILENCE_RATIO) hit.add("MOSTLY_SILENCE");
    if (clippingRatio > CLIPPING_RATIO_THRESHOLD) hit.add("CLIPPED");
    if (snrDb !== null && snrDb < TOO_NOISY_SNR_DB_THRESHOLD) hit.add("TOO_NOISY");
    if (speechRatio > SPEECH_MODULATION_RATIO_THRESHOLD) hit.add("SPEECH_DETECTED");
    if (overlapFrameRatio > OVERLAP_FRAME_RATIO_THRESHOLD) hit.add("MULTIPLE_OVERLAP");
    if (isStationaryTone) hit.add("UNSUPPORTED_SOUND");
    if (!hit.has("MOSTLY_SILENCE") && validSegments.length === 0) hit.add("NO_TARGET_ACTIVITY");

    const feedbackCodes = FEEDBACK_CODE_ORDER.filter((c) => hit.has(c));
    const usable = feedbackCodes.length === 0;

    return {
      usable,
      durationMs,
      activeDurationMs,
      snrDb: snrDb === null ? null : Math.round(snrDb * 10) / 10,
      clippingRatio: Math.round(clippingRatio * 100000) / 100000,
      silenceRatio: Math.round(silenceRatio * 1000) / 1000,
      speechRatio: Math.round(speechRatio * 1000) / 1000,
      feedbackCodes,
      // 계약: "valid_segments is empty when usable is false".
      validSegments: usable ? validSegments : [],
    };
  }
}
