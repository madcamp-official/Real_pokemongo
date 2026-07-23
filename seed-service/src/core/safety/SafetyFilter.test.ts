/**
 * 골든 테스트: 안전 필터 (체크리스트 §4.1 — CI 게이트).
 *
 * 회귀하면 아이가 다칠 수 있는 경로다. 여기 있는 단언(assertion)은 절대 약화시키지 말 것.
 * 핵심 불변식:
 *  - 위험 태그가 있는 종은 반드시 경고하고 showFirst=true.
 *  - 버섯은 절대 식용 판정을 하지 않는다.
 *  - 여러 후보에 위험 후보가 섞이면 보수적으로 경고(거짓 음성 금지).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SafetyFilter,
  EDIBILITY_JUDGEMENT_SUPPORTED,
  isMvpIdentifiable,
} from "./SafetyFilter.js";
import type { Taxon, RiskTag, TaxonGroup } from "../domain/types.js";
import { asTaxonId } from "../domain/ids.js";

function makeTaxon(overrides: Partial<Taxon> & { group: TaxonGroup }): Taxon {
  return {
    id: asTaxonId("t-" + Math.random().toString(36).slice(2)),
    sciName: "Genus species",
    korName: "테스트종",
    rank: "species",
    seasonTags: [],
    habitatTags: [],
    riskTags: [],
    rarity: "common",
    ...overrides,
  };
}

const filter = new SafetyFilter();

test("안전한 종(위험 태그 없음)은 안전 안내가 없다", () => {
  const safe = makeTaxon({ group: "plant", riskTags: [] });
  assert.equal(filter.evaluate(safe), null);
});

test("위험 태그가 있는 종은 반드시 경고하며 showFirst=true", () => {
  const cases: { tag: RiskTag; group: TaxonGroup }[] = [
    { tag: "toxic_if_eaten", group: "plant" },
    { tag: "sting_or_bite", group: "insect" },
    { tag: "contact_dermatitis", group: "plant" },
    { tag: "allergen", group: "plant" },
    { tag: "protected_species", group: "insect" },
  ];
  for (const c of cases) {
    const t = makeTaxon({ group: c.group, riskTags: [c.tag] });
    const notice = filter.evaluate(t);
    assert.ok(notice, `${c.tag}: 경고가 있어야 함`);
    assert.equal(notice!.showFirst, true, `${c.tag}: showFirst 여야 함`);
    assert.ok(notice!.message.length > 0);
    assert.ok(notice!.riskTags.includes(c.tag));
  }
});

test("독성/쏘임은 danger 등급", () => {
  const toxic = makeTaxon({ group: "plant", riskTags: ["toxic_if_eaten"] });
  const sting = makeTaxon({ group: "insect", riskTags: ["sting_or_bite"] });
  assert.equal(filter.evaluate(toxic)!.level, "danger");
  assert.equal(filter.evaluate(sting)!.level, "danger");
});

test("버섯은 위험 태그가 없어도 항상 '눈으로만' 안내(식용 판정 금지)", () => {
  const mushroom = makeTaxon({ group: "fungus", riskTags: [] });
  const notice = filter.evaluate(mushroom);
  assert.ok(notice, "버섯은 항상 안내가 있어야 함");
  assert.equal(notice!.showFirst, true);
  // 식용 가부(먹어도 된다/안 된다) 판정 문구가 아니라 '관찰만' 문구여야 한다.
  assert.match(notice!.message, /눈으로만|만지거나 먹으면 안/);
});

test("이 서비스는 식용 가부를 판정하지 않는다(구조적 보장)", () => {
  assert.equal(EDIBILITY_JUDGEMENT_SUPPORTED, false);
});

test("여러 후보에 위험 후보가 섞이면 보수적으로 경고한다", () => {
  const safe = makeTaxon({ group: "plant", riskTags: [] });
  const risky = makeTaxon({ group: "plant", riskTags: ["contact_dermatitis"] });
  const notice = filter.evaluateCandidates([safe, risky]);
  assert.ok(notice, "위험 후보가 하나라도 있으면 경고해야 함");
  assert.equal(notice!.showFirst, true);
});

test("모든 후보가 안전하면 후보 경고는 없다", () => {
  const a = makeTaxon({ group: "plant", riskTags: [] });
  const b = makeTaxon({ group: "insect", riskTags: [] });
  assert.equal(filter.evaluateCandidates([a, b]), null);
});

test("MVP 동정 대상군은 식물·곤충·버섯으로 제한(새/양서류 제외)", () => {
  assert.equal(isMvpIdentifiable("plant"), true);
  assert.equal(isMvpIdentifiable("insect"), true);
  assert.equal(isMvpIdentifiable("fungus"), true);
  assert.equal(isMvpIdentifiable("bird"), false);
  assert.equal(isMvpIdentifiable("amphibian"), false);
});
