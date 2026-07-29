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
  const unsafeClaims = document.records.filter((record) =>
    /(먹어도\s*(돼|됩니다)|식용\s*(가능|이다)|먹을\s*수\s*있)/u.test(record.sentence),
  );
  assert.deepEqual(unsafeClaims, []);
});

