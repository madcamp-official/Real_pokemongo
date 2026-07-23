/**
 * 골든 테스트: 미디어 정화 (체크리스트 §4.2 프라이버시 / §1.4 — CI 게이트).
 *
 * 회귀하면 아동 사진의 EXIF GPS 가 저장/외부 전송된다(위치 프라이버시 원칙 무력화).
 * 절대 약화 금지.
 * 핵심 불변식:
 *  - JPEG/PNG 의 메타데이터(EXIF·GPS·주석·텍스트)를 제거한다.
 *  - 이미지 구조(디코딩 가능성)는 보존한다.
 *  - 미지 포맷은 통과시키지 않고 거부한다(보수적).
 *  - 멱등: 정화된 이미지를 다시 정화해도 동일.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeImage,
  UnsupportedImageFormatError,
} from "./MediaSanitizer.js";
import {
  makeJpegWithGpsExif,
  makeCleanJpeg,
  makePngWithMetadata,
} from "./fixtures.js";

function bytesInclude(haystack: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

test("JPEG: EXIF·GPS·주석이 제거되고 GPS 존재가 보고된다", () => {
  const dirty = makeJpegWithGpsExif();
  // 정화 전에는 EXIF 식별자와 가짜 좌표 바이트가 존재한다.
  assert.equal(bytesInclude(dirty, ascii("Exif")), true, "픽스처에 EXIF 있어야 함");
  assert.equal(bytesInclude(dirty, ascii("GPS37.512345")), true, "픽스처에 좌표 있어야 함");

  const { image, report } = sanitizeImage(dirty);

  assert.equal(bytesInclude(image, ascii("Exif")), false, "EXIF 마커가 남으면 안 됨");
  assert.equal(bytesInclude(image, ascii("GPS37.512345")), false, "좌표 바이트가 남으면 안 됨");
  assert.equal(bytesInclude(image, ascii("shot on my phone")), false, "주석(COM)도 제거");
  assert.equal(report.hadGps, true, "GPS 존재가 보고되어야 함");
  assert.ok(report.removedSegments >= 2, "APP1+COM 최소 2개 제거");
});

test("JPEG: 정화 후에도 이미지 구조가 보존된다(SOI/SOS/EOI)", () => {
  const { image } = sanitizeImage(makeJpegWithGpsExif());
  // SOI 로 시작
  assert.equal(image[0], 0xff);
  assert.equal(image[1], 0xd8);
  // SOS(FFDA) 존재
  assert.equal(bytesInclude(image, [0xff, 0xda]), true, "SOS 세그먼트 보존");
  // EOI(FFD9) 로 종료
  assert.equal(image[image.length - 2], 0xff);
  assert.equal(image[image.length - 1], 0xd9);
  // JFIF(APP0)는 구조 세그먼트라 유지
  assert.equal(bytesInclude(image, ascii("JFIF")), true, "JFIF(APP0)는 유지");
});

test("PNG: eXIf/tEXt 등 메타데이터 청크가 제거되고 IHDR/IDAT/IEND는 보존된다", () => {
  const dirty = makePngWithMetadata();
  assert.equal(bytesInclude(dirty, ascii("tEXt")), true, "픽스처에 tEXt 있어야 함");
  assert.equal(bytesInclude(dirty, ascii("eXIf")), true, "픽스처에 eXIf 있어야 함");

  const { image, report } = sanitizeImage(dirty);

  assert.equal(bytesInclude(image, ascii("tEXt")), false, "tEXt 제거");
  assert.equal(bytesInclude(image, ascii("eXIf")), false, "eXIf 제거");
  assert.equal(bytesInclude(image, ascii("taken at home")), false, "텍스트 내용 제거");
  assert.equal(bytesInclude(image, ascii("IHDR")), true, "IHDR 보존");
  assert.equal(bytesInclude(image, ascii("IDAT")), true, "IDAT 보존");
  assert.equal(bytesInclude(image, ascii("IEND")), true, "IEND 보존");
  assert.equal(report.hadGps, true, "eXIf 안의 GPS 보고");
});

test("메타데이터 없는 깨끗한 JPEG 은 그대로 통과(제거 0)", () => {
  const clean = makeCleanJpeg();
  const { image, report } = sanitizeImage(clean);
  assert.equal(report.removedSegments, 0);
  assert.equal(report.hadGps, false);
  assert.deepEqual(image, clean as unknown as Uint8Array);
});

test("미지 포맷은 거부한다(메타데이터 누출 방지, 보수적)", () => {
  const random = Uint8Array.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
  assert.throws(() => sanitizeImage(random), UnsupportedImageFormatError);
});

test("멱등성: 정화된 이미지를 다시 정화해도 바이트가 동일하다", () => {
  const once = sanitizeImage(makeJpegWithGpsExif()).image;
  const twice = sanitizeImage(once).image;
  assert.deepEqual(twice, once as unknown as Uint8Array);
  const pngOnce = sanitizeImage(makePngWithMetadata()).image;
  const pngTwice = sanitizeImage(pngOnce).image;
  assert.deepEqual(pngTwice, pngOnce as unknown as Uint8Array);
});
