import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { sanitizeImage } from "./MediaSanitizer.js";
import { makeCleanJpeg } from "./fixtures.js";
import {
  enhanceImages,
  laplacianVariance,
  exposureSpread,
  RETAKE_CONFIDENCE_THRESHOLD,
} from "./ImageEnhancer.js";

// ── 순수 함수 단위 테스트 ──────────────────────────────────────────────────

test("laplacianVariance: 완전히 평탄한 이미지는 분산 0", () => {
  const flat = new Uint8Array(10 * 10).fill(128);
  assert.equal(laplacianVariance(flat, 10, 10), 0);
});

test("laplacianVariance: 체커보드 패턴은 평탄한 이미지보다 분산이 훨씬 크다", () => {
  const w = 20;
  const h = 20;
  const checker = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      checker[y * w + x] = (x + y) % 2 === 0 ? 255 : 0;
    }
  }
  const flat = new Uint8Array(w * h).fill(128);
  assert.ok(laplacianVariance(checker, w, h) > laplacianVariance(flat, w, h));
});

test("exposureSpread: 값이 한 곳에 몰린 히스토그램은 spread가 0에 가깝다", () => {
  const spike = new Uint8Array(1000).fill(10);
  assert.ok(exposureSpread(spike) < 0.05);
});

test("exposureSpread: 0~255에 고르게 퍼진 히스토그램은 spread가 1에 가깝다", () => {
  const uniform = new Uint8Array(256);
  for (let i = 0; i < 256; i++) uniform[i] = i;
  assert.ok(exposureSpread(uniform) > 0.9);
});

// ── enhanceImages 통합 테스트 ──────────────────────────────────────────────

async function realJpeg(opts: {
  w: number;
  h: number;
  checker?: boolean;
  dim?: boolean;
}) {
  let img: ReturnType<typeof sharp>;
  if (opts.checker) {
    const buf = Buffer.alloc(opts.w * opts.h * 3);
    for (let y = 0; y < opts.h; y++) {
      for (let x = 0; x < opts.w; x++) {
        const v = ((x >> 2) + (y >> 2)) % 2 === 0 ? 230 : 20;
        const idx = (y * opts.w + x) * 3;
        buf[idx] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
      }
    }
    img = sharp(buf, { raw: { width: opts.w, height: opts.h, channels: 3 } });
  } else {
    img = sharp({
      create: {
        width: opts.w,
        height: opts.h,
        channels: 3,
        background: opts.dim ? { r: 8, g: 8, b: 8 } : { r: 120, g: 130, b: 140 },
      },
    });
  }
  const jpeg = await img.jpeg({ quality: 90 }).toBuffer();
  return sanitizeImage(new Uint8Array(jpeg)).image;
}

test("enhanceImages: 디코딩 불가능한(구조만 유효한) 이미지는 원본을 그대로 통과시킨다(폴백)", async () => {
  const fake = sanitizeImage(makeCleanJpeg()).image;
  const result = await enhanceImages([fake]);
  assert.equal(result.report.mergeStrategy, "passthrough");
  assert.deepEqual(result.image, fake);
});

test("enhanceImages: 실제로 디코딩되는 흐릿+저노출 이미지는 confidence가 낮고 재촬영을 제안한다", async () => {
  const dull = await realJpeg({ w: 128, h: 96, dim: true });
  const result = await enhanceImages([dull]);
  assert.equal(result.report.mergeStrategy, "single");
  assert.ok(result.report.confidence < RETAKE_CONFIDENCE_THRESHOLD);
  assert.equal(result.report.retakeSuggested, true);
});

test("enhanceImages: 선명하고 노출이 고른 이미지는 confidence가 높고 재촬영을 제안하지 않는다", async () => {
  const crisp = await realJpeg({ w: 128, h: 96, checker: true });
  const result = await enhanceImages([crisp]);
  assert.ok(result.report.confidence >= RETAKE_CONFIDENCE_THRESHOLD);
  assert.equal(result.report.retakeSuggested, false);
});

test("enhanceImages: 선명한 사진에 실제 모션 블러(가우시안 블러)를 먹이면 흐림이 정확히 감지된다", async () => {
  // 실기기 테스트에서 "일부러 흔들어 찍었는데 재촬영 제안이 안 뜬다"는 결과가 나왔다 —
  // 다만 그 테스트 사진은 화면(모니터)을 재촬영한 것이라 무아레 노이즈가 낀 상태였다.
  // 화면 재촬영 아티팩트와 진짜 블러 감지 실패를 구분하기 위해, 무아레 없이 순수하게
  // "디테일 있는 이미지 + 실제 가우시안 블러"만으로 감지되는지 직접 검증한다.
  const w = 128, h = 96;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = ((x >> 2) + (y >> 2)) % 2 === 0 ? 230 : 20;
      const idx = (y * w + x) * 3;
      buf[idx] = v; buf[idx + 1] = v; buf[idx + 2] = v;
    }
  }
  const sharpJpeg = await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
  const blurredJpeg = await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .blur(6) // 강한 블러 — 실제 손떨림 정도의 디테일 손실 흉내
    .jpeg({ quality: 90 })
    .toBuffer();

  const sharpImg = sanitizeImage(new Uint8Array(sharpJpeg)).image;
  const blurredImg = sanitizeImage(new Uint8Array(blurredJpeg)).image;

  const sharpResult = await enhanceImages([sharpImg]);
  const blurredResult = await enhanceImages([blurredImg]);

  assert.ok(
    blurredResult.report.blurScore < sharpResult.report.blurScore,
    `블러 처리한 이미지의 blurScore(${blurredResult.report.blurScore})가 원본(${sharpResult.report.blurScore})보다 낮아야 한다`,
  );
  assert.equal(blurredResult.report.retakeSuggested, true, "실제로 블러가 심하면 재촬영을 제안해야 한다");
});

test("enhanceImages: 결과 이미지는 실제로 다시 디코딩 가능하고(SanitizedImage 불변식), 짧은 변이 정규화 크기로 맞춰진다", async () => {
  const crisp = await realJpeg({ w: 128, h: 96, checker: true });
  const result = await enhanceImages([crisp]);
  const meta = await sharp(Buffer.from(result.image)).metadata();
  assert.equal(meta.format, "jpeg");
  assert.ok(meta.width! > 0 && meta.height! > 0);
  // 원본(96 짧은 변)보다 크롭+업스케일 후 짧은 변이 커졌는지(512 정규화 목표) 확인.
  assert.ok(Math.min(meta.width!, meta.height!) > 96);
});

test("enhanceImages: 서로 거의 같은(정지샷) 버스트는 평균 병합을 선택한다", async () => {
  const crisp = await realJpeg({ w: 96, h: 96, checker: true });
  const result = await enhanceImages([crisp, crisp, crisp]);
  assert.equal(result.report.mergeStrategy, "averaged-burst");
  assert.equal(result.report.framesUsed, 3);
});

test("enhanceImages: 서로 크게 다른(흔들림/이동) 버스트는 가장 선명한 프레임 하나만 선택한다", async () => {
  const crisp = await realJpeg({ w: 96, h: 96, checker: true });
  const dull = await realJpeg({ w: 96, h: 96, dim: true });
  const result = await enhanceImages([dull, crisp]);
  assert.equal(result.report.mergeStrategy, "sharpest-of-burst");
});

test("enhanceImages: 빈 배열은 에러(호출부 계약 위반 — 실제로는 라우트가 먼저 400 처리)", async () => {
  await assert.rejects(() => enhanceImages([]));
});
