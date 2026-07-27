import { test } from "node:test";
import assert from "node:assert/strict";
import { signMediaToken, verifyMediaToken, MEDIA_TOKEN_TTL_SECONDS } from "./mediaToken.js";

const SECRET = "test-secret";

test("정상 발급된 토큰은 같은 observationId로 검증 통과", () => {
  const token = signMediaToken("obs-1", SECRET);
  assert.equal(verifyMediaToken(token, "obs-1", SECRET), true);
});

test("다른 observationId에는 재사용할 수 없다(사진 A 토큰으로 사진 B 요청)", () => {
  const token = signMediaToken("obs-1", SECRET);
  assert.equal(verifyMediaToken(token, "obs-2", SECRET), false);
});

test("만료 시각이 지나면 거부된다", () => {
  const issuedAt = new Date("2026-01-01T00:00:00Z");
  const token = signMediaToken("obs-1", SECRET, issuedAt);
  const justBeforeExpiry = new Date(issuedAt.getTime() + (MEDIA_TOKEN_TTL_SECONDS - 1) * 1000);
  const justAfterExpiry = new Date(issuedAt.getTime() + (MEDIA_TOKEN_TTL_SECONDS + 1) * 1000);
  assert.equal(verifyMediaToken(token, "obs-1", SECRET, justBeforeExpiry), true);
  assert.equal(verifyMediaToken(token, "obs-1", SECRET, justAfterExpiry), false);
});

test("서명이 위변조되면 거부된다", () => {
  const token = signMediaToken("obs-1", SECRET);
  const [exp] = token.split(".");
  const tampered = `${exp}.${"0".repeat(64)}`;
  assert.equal(verifyMediaToken(tampered, "obs-1", SECRET), false);
});

test("다른 secret으로 서명된 토큰은 거부된다", () => {
  const token = signMediaToken("obs-1", "other-secret");
  assert.equal(verifyMediaToken(token, "obs-1", SECRET), false);
});

test("형식이 깨진 토큰(구분자 없음, 숫자가 아닌 만료시각 등)은 예외 없이 false", () => {
  assert.equal(verifyMediaToken("garbage", "obs-1", SECRET), false);
  assert.equal(verifyMediaToken("notanumber.abcd", "obs-1", SECRET), false);
  assert.equal(verifyMediaToken("123.not-hex-!!", "obs-1", SECRET), false);
  assert.equal(verifyMediaToken("", "obs-1", SECRET), false);
});
