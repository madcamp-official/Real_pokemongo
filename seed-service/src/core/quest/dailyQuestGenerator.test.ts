import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDailyQuest } from "./dailyQuestGenerator.js";
import { asTaxonId } from "../domain/ids.js";
import type { Taxon } from "../domain/types.js";

function taxon(id: string, overrides: Partial<Omit<Taxon, "id">> = {}): Taxon {
  return {
    id: asTaxonId(id),
    sciName: id,
    korName: id,
    rank: "species",
    group: "insect",
    seasonTags: [],
    habitatTags: [],
    riskTags: [],
    rarity: "common",
    ...overrides,
  };
}

const SAMPLE_TAXA: Taxon[] = [
  taxon("a", { group: "insect", habitatTags: ["waterside"], seasonTags: ["summer"] }),
  taxon("b", { group: "insect", habitatTags: ["waterside"], seasonTags: ["summer"] }),
  taxon("c", { group: "insect", habitatTags: ["field"], seasonTags: ["autumn"] }),
  taxon("d", { group: "plant", habitatTags: ["mountain"], seasonTags: ["spring"] }),
  taxon("e", { group: "plant", habitatTags: ["mountain"], seasonTags: ["spring"] }),
  taxon("f", { group: "bird", habitatTags: ["park"], seasonTags: [] }),
];

test("generateDailyQuest: 같은 날짜면 항상 같은 퀘스트를 만든다(결정론적)", () => {
  const now = new Date("2026-07-28T03:00:00.000Z");
  const q1 = generateDailyQuest(SAMPLE_TAXA, now);
  const q2 = generateDailyQuest(SAMPLE_TAXA, now);
  assert.deepEqual(q1, q2);
});

test("generateDailyQuest: id가 Asia/Seoul 날짜 키를 담는다", () => {
  const now = new Date("2026-07-28T03:00:00.000Z"); // UTC 03:00 = Seoul 12:00, 같은 날
  const quest = generateDailyQuest(SAMPLE_TAXA, now);
  assert.equal(quest.id, "quest-daily-2026-07-28");
  assert.equal(quest.type, "daily");
});

test("generateDailyQuest: 하루가 지나면(날짜 키가 바뀌면) 다른 id를 만든다", () => {
  const day1 = generateDailyQuest(SAMPLE_TAXA, new Date("2026-07-28T03:00:00.000Z"));
  const day2 = generateDailyQuest(SAMPLE_TAXA, new Date("2026-07-29T03:00:00.000Z"));
  assert.notEqual(day1.id, day2.id);
});

test("generateDailyQuest: criteria.group은 반드시 채워지고, distinctTaxa는 실제로 그 조건을 만족하는 종 수를 넘지 않는다", () => {
  // 넉넉히 여러 날짜를 순회하며 매번 조건을 검증(하나의 시드 결과만 보고 우연히 통과하는 걸 방지).
  for (let day = 1; day <= 28; day++) {
    const now = new Date(`2026-01-${String(day).padStart(2, "0")}T03:00:00.000Z`);
    const quest = generateDailyQuest(SAMPLE_TAXA, now);
    assert.ok(quest.criteria.group, `day ${day}: group이 있어야 함`);
    const matching = SAMPLE_TAXA.filter((t) => {
      if (t.group !== quest.criteria.group) return false;
      if (quest.criteria.habitat && !t.habitatTags.includes(quest.criteria.habitat)) return false;
      if (quest.criteria.season && !t.seasonTags.includes(quest.criteria.season)) return false;
      return true;
    });
    assert.ok(
      matching.length >= quest.criteria.distinctTaxa,
      `day ${day}: 후보 ${matching.length}종인데 목표가 ${quest.criteria.distinctTaxa}종`,
    );
    assert.ok(quest.criteria.distinctTaxa >= 2 && quest.criteria.distinctTaxa <= 3);
  }
});

test("generateDailyQuest: 종 후보가 하나도 없으면(2종 미만인 분류군만 있으면) 에러를 던진다", () => {
  const tiny: Taxon[] = [taxon("only-one", { group: "mammal" })];
  assert.throws(() => generateDailyQuest(tiny, new Date("2026-07-28T03:00:00.000Z")));
});

test("generateDailyQuest: activeFrom/activeTo가 그 날 Asia/Seoul 하루를 정확히 덮는다", () => {
  const now = new Date("2026-07-28T03:00:00.000Z");
  const quest = generateDailyQuest(SAMPLE_TAXA, now);
  assert.equal(quest.activeFrom, "2026-07-27T15:00:00.000Z"); // 2026-07-28T00:00+09:00
  assert.equal(quest.activeTo, "2026-07-28T14:59:59.999Z"); // 2026-07-28T23:59:59.999+09:00
});
