/**
 * 골든 테스트: 오디오 시그니처 판별.
 * 핵심 불변식:
 *  - WAV(RIFF/WAVE)와 M4A/MP4 계열(ftyp 박스)만 통과한다.
 *  - 확장자·MIME이 아니라 바이트 자체로 판별한다.
 *  - 그 외(임의 바이트)는 예외로 거부한다(보수적 — MediaSanitizer와 같은 원칙).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAudioFormat, UnsupportedAudioFormatError } from "./AudioSignature.js";
import { makeMinimalM4aSignatureOnly, makeMinimalWavSignatureOnly } from "./fixtures.js";

test("WAV 시그니처를 인식한다", () => {
  assert.equal(detectAudioFormat(makeMinimalWavSignatureOnly()), "wav");
});

test("M4A(ftyp) 시그니처를 인식한다", () => {
  assert.equal(detectAudioFormat(makeMinimalM4aSignatureOnly()), "m4a");
});

test("미지 바이트는 거부한다", () => {
  assert.throws(
    () => detectAudioFormat(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])),
    UnsupportedAudioFormatError,
  );
});

test("너무 짧은 바이트열도 거부한다", () => {
  assert.throws(() => detectAudioFormat(Uint8Array.from([0x52, 0x49])), UnsupportedAudioFormatError);
});

test("MP3 등 다른 실제 포맷(ID3 태그)도 거부한다", () => {
  const id3 = Uint8Array.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assert.throws(() => detectAudioFormat(id3), UnsupportedAudioFormatError);
});
