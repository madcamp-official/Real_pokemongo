import test from "node:test";
import assert from "node:assert/strict";
import { getConfusableSciNames } from "../identification/confusionPairs.js";
import { SEED_CONTENT, SEED_TAXA } from "../../seed/seedData.js";
import { assertKnowledgeDocument, buildKnowledgeDocument } from "./KnowledgeIndexer.js";

test("도감 박사 지식: 82종 모두 최소 4문장이고 chunk_id가 결정론적이다", () => {
  const first = buildKnowledgeDocument(SEED_TAXA, SEED_CONTENT, getConfusableSciNames);
  const second = buildKnowledgeDocument(SEED_TAXA, SEED_CONTENT, getConfusableSciNames);

  assert.doesNotThrow(() =>
    assertKnowledgeDocument(
      first,
      SEED_TAXA.map((taxon) => taxon.id as string),
    ),
  );
  assert.equal(first.content_hash, second.content_hash);
  assert.deepEqual(
    first.records.map((record) => record.chunk_id),
    second.records.map((record) => record.chunk_id),
  );
  assert.equal(new Set(first.records.map((record) => record.chunk_id)).size, first.records.length);
  assert.ok(first.records.every((record) => record.sentence.trim().length > 0));
});

test("도감 박사 지식: 위험 생물과 버섯은 안전 문장을 반드시 가진다", () => {
  const document = buildKnowledgeDocument(SEED_TAXA, SEED_CONTENT, getConfusableSciNames);
  const safetySpecies = new Set(
    document.records.filter((record) => record.is_safety).map((record) => record.species_id),
  );
  const expected = SEED_TAXA.filter(
    (taxon) => taxon.riskTags.length > 0 || taxon.group === "fungus",
  );
  assert.ok(expected.length > 0);
  assert.ok(expected.every((taxon) => safetySpecies.has(taxon.id as string)));
});

test("도감 박사 지식: 식용 가능성을 판정하는 문장을 생성하지 않는다", () => {
  const document = buildKnowledgeDocument(SEED_TAXA, SEED_CONTENT, getConfusableSciNames);
  const unsafePattern = /(먹어도\s*(돼|됩니다)|식용\s*(가능|이다)|먹을\s*수\s*있)/u;
  const unsafeClaims = document.records.filter(
    (record) => unsafePattern.test(record.sentence) || unsafePattern.test(record.answer),
  );
  assert.deepEqual(unsafeClaims, []);
});

test("도감 박사 지식: 자주 헷갈리는 새 4쌍은 similar 문장을 양방향으로 가진다(2026-07-30)", () => {
  // confusionPairs.ts(BioCLIP 텍스트 임베딩 자동 산출)는 임계값을 넘는 곤충·식물
  // 위주라 조류 쌍을 하나도 못 걸렀다 — "까치랑 까마귀 어떻게 달라?" 라이브 버그가
  // 바로 이 공백 때문이었다. seedData.ts의 knowledgeFacts에 수작업으로 추가한
  // 4쌍(8개 문장)이 실제로 존재하고, 서로 상대 종 이름을 언급하는지 확인한다.
  const document = buildKnowledgeDocument(SEED_TAXA, SEED_CONTENT, getConfusableSciNames);
  const similarBySpecies = new Map<string, string[]>();
  for (const record of document.records) {
    if (record.field_type !== "similar") continue;
    const list = similarBySpecies.get(record.species_name) ?? [];
    list.push(record.answer);
    similarBySpecies.set(record.species_name, list);
  }

  const pairs: Array<[string, string]> = [
    ["까치", "큰부리까마귀"],
    ["까치", "물까치"],
    ["박새", "쇠박새"],
    ["참새", "딱새"],
  ];
  for (const [a, b] of pairs) {
    const answersForA = similarBySpecies.get(a) ?? [];
    const answersForB = similarBySpecies.get(b) ?? [];
    assert.ok(
      answersForA.some((answer) => answer.includes(b)),
      `${a}의 similar 문장 중 ${b}를 언급하는 게 없다: ${JSON.stringify(answersForA)}`,
    );
    assert.ok(
      answersForB.some((answer) => answer.includes(a)),
      `${b}의 similar 문장 중 ${a}를 언급하는 게 없다: ${JSON.stringify(answersForB)}`,
    );
  }
});

test("도감 박사 지식: answer는 검색용 라벨(콜론) 문장을 그대로 노출하지 않는다", () => {
  const document = buildKnowledgeDocument(SEED_TAXA, SEED_CONTENT, getConfusableSciNames);
  const labelLeaks = document.records.filter((record) =>
    /(관찰 장소:|활동 시간:|크기:|관찰 계절:|관찰 포인트:|헷갈리기 쉬운 생물:)/u.test(record.answer),
  );
  assert.deepEqual(
    labelLeaks.map((r) => r.chunk_id),
    [],
  );
  assert.ok(document.records.every((record) => record.answer.trim().length > 0));
});

