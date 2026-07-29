import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, meanPool, clamp01 } from "./vectorMath.js";

test("cosineSimilarity: 동일 벡터는 1", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test("cosineSimilarity: 직교 벡터는 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity: 정반대 방향은 -1", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [-1, -2, -3]), -1);
});

test("cosineSimilarity: 스케일만 다른 같은 방향 벡터도 1(크기 정규화됨)", () => {
  assert.ok(Math.abs(cosineSimilarity([2, 4, 6], [1, 2, 3]) - 1) < 1e-9);
});

test("cosineSimilarity: 차원이 다르면 throw", () => {
  assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]));
});

test("cosineSimilarity: 영벡터가 섞이면 NaN 대신 0", () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
});

test("meanPool: 여러 벡터의 요소별 평균", () => {
  assert.deepEqual(meanPool([[1, 2], [3, 4], [5, 6]]), [3, 4]);
});

test("meanPool: 벡터 1개면 그대로", () => {
  assert.deepEqual(meanPool([[1, 2, 3]]), [1, 2, 3]);
});

test("meanPool: 빈 배열은 throw", () => {
  assert.throws(() => meanPool([]));
});

test("clamp01: 범위 밖 값을 0..1로 자른다", () => {
  assert.equal(clamp01(-0.5), 0);
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(0.42), 0.42);
});
