/**
 * F3 저품질 사진 보정 — 경량 고전 영상처리 버전 (제품 결정, 세션 논의 결과).
 *
 * 딥러닝 모델을 GPU 서버에 새로 배포하는 대신, 결정론적 알고리즘만으로 구현한다:
 *   1) 블러 측정 — 라플라시안 분산(그레이스케일). 값이 낮을수록 흐릿함.
 *   2) 노출 보정 — CLAHE(대비 제한 적응형 히스토그램 평활화). 역광/저조도를 완화.
 *   3) ROI 크롭 + 업스케일 — 실제 피사체 검출기가 없으므로 "가운데에 담아요" 가이드
 *      전제(GuideOverlay.tsx)를 그대로 활용한 중앙 크롭 휴리스틱. 정밀 객체 검출이
 *      아니라는 한계를 문서로 명시해둔다.
 *   4) 버스트 프레임 병합 — 진짜 모션 정합(optical flow) 없이: 프레임들이 서로
 *      충분히 비슷하면(=삼각대 수준 정지샷) 평균으로 노이즈를 줄이고, 그렇지 않으면
 *      (흔들림/피사체 이동) 어설픈 평균이 유령상(ghosting)을 만들 수 있어 가장 선명한
 *      프레임 하나만 쓴다.
 *
 * sharp가 실제로 디코딩 못 하는 입력(예: 테스트 픽스처처럼 구조만 유효한 바이트, 혹은
 * 정말 손상된 사진)을 만나면 **절대 업로드 파이프라인을 막지 않는다** — 원본을 그대로
 * 통과시키고 confidence를 중립값으로 채운다. 보정은 있으면 좋은 부가 기능이지, 없다고
 * 촬영 자체가 실패해선 안 된다.
 */
import sharp from "sharp";
import { sanitizeImage, type SanitizedImage } from "./MediaSanitizer.js";

export type MergeStrategy = "single" | "sharpest-of-burst" | "averaged-burst" | "passthrough";

export interface EnhancementReport {
  /** 라플라시안 분산(정규화 전 원값). 참고/디버깅용 — 임계값 판단엔 blurScore를 쓴다. */
  rawBlurVariance: number;
  /** 0~1로 정규화한 선명도 점수. 높을수록 선명함. */
  blurScore: number;
  /** 0~1로 정규화한 노출 적정성 점수. 높을수록 히스토그램이 고르게 분포(과다/저노출 아님). */
  exposureScore: number;
  /** blurScore/exposureScore를 합성한 종합 신뢰도(0~1). */
  confidence: number;
  /** confidence가 임계값 미만이면 true — 프론트가 "다시 찍어볼까요?" 안내에 쓸 수 있음. */
  retakeSuggested: boolean;
  /** 입력으로 받은 프레임 수. */
  framesUsed: number;
  /** 여러 프레임을 어떻게 처리했는지. */
  mergeStrategy: MergeStrategy;
}

export interface EnhancementResult {
  image: SanitizedImage;
  report: EnhancementReport;
}

/** 실측 전 잠정값(confidencePolicy.ts와 같은 성격의 TODO) — 실사용 데이터로 재조정 대상. */
export const RETAKE_CONFIDENCE_THRESHOLD = 0.35;

/** 라플라시안 분산이 이 값 이상이면 "충분히 선명"으로 간주(1.0으로 클램프). 사진 크기·ISO에 따라
 * 편차가 크므로 잠정값이다. */
const BLUR_VARIANCE_SATURATION = 400;

/** 두 프레임(같은 크기로 리사이즈된 그레이스케일)의 평균 절대 차이가 이 값 이하면
 * "정지샷"으로 보고 평균 병합, 초과하면 흔들림/피사체 이동으로 보고 최선명 프레임만 채택. */
const BURST_STATIC_DIFF_THRESHOLD = 12;

/** ROI 크롭 시 짧은 변 기준으로 남길 비율(중앙 80%) — 가장자리 배경을 살짝 걷어낸다. */
const ROI_CROP_RATIO = 0.8;

/** 최종 출력 정규화 크기(짧은 변 기준). 동정 모델 입력 해상도를 일정하게 맞춘다. */
const TARGET_SHORT_SIDE = 512;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** 그레이스케일 raw 버퍼에 3x3 라플라시안 커널을 적용해 분산을 구한다 — 순수 함수, 픽셀 배열만 본다. */
export function laplacianVariance(gray: Uint8Array | Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  const values: number[] = [];
  const at = (x: number, y: number) => gray[y * width + x]!;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const lap =
        -4 * at(x, y) + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
      values.push(lap);
    }
  }
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return variance;
}

/** 그레이스케일 히스토그램의 "펼쳐진 정도" — 저노출/과다노출(값이 한쪽에 몰림)일수록 낮다. */
export function exposureSpread(gray: Uint8Array | Uint8ClampedArray): number {
  if (gray.length === 0) return 0;
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]!++;
  const n = gray.length;
  // 5~95 퍼센타일 구간 폭을 0~1로 정규화 — 표준편차보다 극단 이상치(핫픽셀 등)에 덜 민감하다.
  let cum = 0;
  let p5 = 0;
  let p95 = 255;
  const p5Target = n * 0.05;
  const p95Target = n * 0.95;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum >= p5Target && p5 === 0) p5 = v;
    if (cum >= p95Target) {
      p95 = v;
      break;
    }
  }
  return clamp01((p95 - p5) / 255);
}

/** 평균 절대 차이(같은 크기 두 그레이스케일 버퍼) — 버스트 프레임이 "정지샷"인지 판단. */
function meanAbsDiff(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / n;
}

interface DecodedFrame {
  gray: Uint8Array;
  width: number;
  height: number;
  original: Buffer;
}

async function decodeGray(bytes: Buffer): Promise<DecodedFrame | null> {
  try {
    const pipeline = sharp(bytes, { failOn: "none" });
    const { data, info } = await pipeline
      .clone()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { gray: new Uint8Array(data), width: info.width, height: info.height, original: bytes };
  } catch {
    return null; // 디코딩 불가 — 호출부가 폴백 처리한다.
  }
}

function passthroughResult(images: SanitizedImage[]): EnhancementResult {
  // 여러 장이 들어와도 폴백에서는 첫 장만 통과시킨다(병합 자체를 신뢰할 수 없는 상황이므로).
  return {
    image: images[0]!,
    report: {
      rawBlurVariance: 0,
      blurScore: 0.5,
      exposureScore: 0.5,
      confidence: 0.5,
      retakeSuggested: false,
      framesUsed: images.length,
      mergeStrategy: "passthrough",
    },
  };
}

/**
 * 보정 파이프라인 진입점. 실패해도 절대 throw하지 않는다(위 passthroughResult 참고) —
 * 업로드 파이프라인 전체를 보정 실패 하나가 막아선 안 되기 때문.
 */
export async function enhanceImages(images: SanitizedImage[]): Promise<EnhancementResult> {
  if (images.length === 0) {
    throw new Error("[ImageEnhancer] 이미지가 최소 1장 필요합니다.");
  }

  const decoded = await Promise.all(images.map((img) => decodeGray(Buffer.from(img))));
  const valid = decoded.filter((d): d is DecodedFrame => d !== null);
  if (valid.length === 0) return passthroughResult(images);

  // ── 프레임 선택/병합 ────────────────────────────────────────────────────
  let mergeStrategy: MergeStrategy;
  let chosenBytes: Buffer;

  if (valid.length === 1) {
    mergeStrategy = "single";
    chosenBytes = valid[0]!.original;
  } else {
    // 인접 프레임 쌍의 평균 절대 차이 중 최댓값 — 하나라도 크게 다르면 흔들림/이동으로 본다.
    let maxDiff = 0;
    for (let i = 1; i < valid.length; i++) {
      maxDiff = Math.max(maxDiff, meanAbsDiff(valid[i - 1]!.gray, valid[i]!.gray));
    }

    if (maxDiff <= BURST_STATIC_DIFF_THRESHOLD) {
      mergeStrategy = "averaged-burst";
      chosenBytes = await averageFrames(valid.map((v) => v.original));
    } else {
      mergeStrategy = "sharpest-of-burst";
      let best = valid[0]!;
      let bestScore = laplacianVariance(best.gray, best.width, best.height);
      for (const v of valid.slice(1)) {
        const score = laplacianVariance(v.gray, v.width, v.height);
        if (score > bestScore) {
          best = v;
          bestScore = score;
        }
      }
      chosenBytes = best.original;
    }
  }

  // ── 품질 측정(병합 후 이미지 기준) ──────────────────────────────────────
  const measured = await decodeGray(chosenBytes);
  if (!measured) return passthroughResult(images);

  const rawBlurVariance = laplacianVariance(measured.gray, measured.width, measured.height);
  const blurScore = clamp01(rawBlurVariance / BLUR_VARIANCE_SATURATION);
  const exposureScore = exposureSpread(measured.gray);
  const confidence = clamp01(0.6 * blurScore + 0.4 * exposureScore);
  const retakeSuggested = confidence < RETAKE_CONFIDENCE_THRESHOLD;

  // ── 실제 보정(CLAHE + 살짝 샤프닝 + 중앙 크롭 + 업스케일) ────────────────
  // maxSlope=3(sharp 기본값)으로 실기기 테스트했더니, 이미 100% 확신으로 정확히 맞히던
  // 실사진(광대버섯)이 크롭+리사이즈와 결합됐을 때 confidence가 1.0→0.85로 떨어지며
  // tier가 high→medium으로 격하되는 걸 발견했다(회귀). A/B 테스트로 원인을 좁혀보니
  // CLAHE 단독이나 크롭+리사이즈 단독은 전혀 문제없었고, 오직 "크롭+리사이즈 이후
  // maxSlope=3 CLAHE"의 조합에서만 재현됐다 — 다운스케일된 이미지에 고정 픽셀 크기
  // 타일(8x8)로 대비를 과하게 밀어붙이며 생기는 지역적 노이즈가 원인으로 추정된다.
  // maxSlope=1(가장 보수적인 설정)로 낮추니 같은 조합에서도 정확히 1.0/high로
  // 복원됨을 재확인했다 — 실측 기반 값이지 임의값이 아니다.
  const CLAHE_MAX_SLOPE = 1;

  let finalBuffer: Buffer;
  try {
    const meta = await sharp(chosenBytes, { failOn: "none" }).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    let pipeline = sharp(chosenBytes, { failOn: "none" })
      .clahe({ width: 8, height: 8, maxSlope: CLAHE_MAX_SLOPE })
      .sharpen({ sigma: 0.6 });

    if (w > 0 && h > 0) {
      const shortSide = Math.min(w, h);
      const cropShort = Math.round(shortSide * ROI_CROP_RATIO);
      const cropW = Math.round(w * (cropShort / shortSide));
      const cropH = Math.round(h * (cropShort / shortSide));
      const left = Math.round((w - cropW) / 2);
      const top = Math.round((h - cropH) / 2);
      pipeline = pipeline
        .extract({ left, top, width: cropW, height: cropH })
        .resize({
          width: w >= h ? undefined : TARGET_SHORT_SIDE,
          height: h >= w ? undefined : TARGET_SHORT_SIDE,
          fit: "inside",
          kernel: "lanczos3",
        });
    }

    finalBuffer = await pipeline.jpeg({ quality: 90 }).toBuffer();
  } catch {
    // 크롭/보정 파이프라인이 예상 못 한 입력(극단적으로 작은 이미지 등)에서 실패하면
    // 원본(병합까지는 마친 상태)을 그대로 쓴다 — 측정치는 이미 계산해뒀으니 살린다.
    finalBuffer = chosenBytes;
  }

  // sanitizeImage()를 다시 태워야 SanitizedImage 타입이 나온다(MediaSanitizer.ts의 불변식 —
  // 이 모듈 밖에서 만들 수 없음) + sharp가 메타데이터를 남겼을 가능성에 대한 이중 방어.
  const { image: sanitized } = sanitizeImage(new Uint8Array(finalBuffer));

  return {
    image: sanitized,
    report: {
      rawBlurVariance,
      blurScore,
      exposureScore,
      confidence,
      retakeSuggested,
      framesUsed: images.length,
      mergeStrategy,
    },
  };
}

/** 여러 프레임을 픽셀 단위로 평균(정지샷 노이즈 저감). 모두 같은 크기로 맞춘 뒤 평균한다. */
async function averageFrames(frames: Buffer[]): Promise<Buffer> {
  const metas = await Promise.all(frames.map((f) => sharp(f, { failOn: "none" }).metadata()));
  const width = Math.min(...metas.map((m) => m.width ?? Infinity));
  const height = Math.min(...metas.map((m) => m.height ?? Infinity));

  const raws = await Promise.all(
    frames.map((f) =>
      sharp(f, { failOn: "none" })
        .resize(width, height, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ),
  );

  const channels = raws[0]!.info.channels;
  const pixelCount = width * height * channels;
  const sum = new Float64Array(pixelCount);
  for (const r of raws) {
    for (let i = 0; i < pixelCount; i++) sum[i]! += r.data[i]!;
  }
  const avg = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) avg[i] = Math.round(sum[i]! / raws.length);

  return sharp(avg, { raw: { width, height, channels } }).jpeg({ quality: 95 }).toBuffer();
}
