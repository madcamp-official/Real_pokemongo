import { test } from "node:test";
import assert from "node:assert/strict";
import { isConfusablePair } from "./confusionPairs.js";

test("알려진 혼동 쌍은 순서 무관하게 true를 반환한다", () => {
  assert.equal(isConfusablePair("Pieris rapae", "Pieris melete"), true);
  assert.equal(isConfusablePair("Pieris melete", "Pieris rapae"), true, "순서를 바꿔도 동일해야 함");
});

test("혼동 쌍이 아닌 임의의 두 학명은 false를 반환한다", () => {
  assert.equal(isConfusablePair("Taraxacum officinale", "Apis mellifera"), false);
});

test("같은 학명을 두 번 넣으면 false(자기 자신과는 혼동 쌍이 아님)", () => {
  assert.equal(isConfusablePair("Pieris rapae", "Pieris rapae"), false);
});

test("목록에 등록된 대표 쌍 몇 개가 실제로 조회된다", () => {
  assert.equal(isConfusablePair("Harmonia axyridis", "Coccinella septempunctata"), true, "무당벌레 vs 칠성무당벌레");
  assert.equal(isConfusablePair("Anas platyrhynchos", "Anas zonorhyncha"), true, "청둥오리 vs 흰뺨검둥오리");
  assert.equal(isConfusablePair("Ardea cinerea", "Ardea alba"), true, "왜가리 vs 대백로");
});
