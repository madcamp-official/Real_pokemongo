import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taxonGroupToKorean,
  rarityToKorean,
  habitatTagsToDisplay,
  taxonToSpeciesCard,
  collectionEntryToDexEntry,
  creatureToApiCreature,
  buildDexCompletion,
  outcomeToIdentifyResponse,
  buildSignupResponse,
  buildRestoreBundle,
  badgeDefToApiBadge,
  questToApiQuest,
  buildXpProfile,
} from "./mappers.js";
import { asTaxonId, newUserId, newCreatureId } from "../core/domain/ids.js";
import type { Taxon, TaxonGroup, CollectionEntry, User, Creature } from "../core/domain/types.js";
import type { SafetyNotice } from "../core/safety/SafetyFilter.js";
import type { IdentificationOutcome } from "../core/identification/IdentificationGateway.js";
import type { BadgeDefinition, EarnedBadge } from "../core/rewards/rewardTypes.js";
import { DEFAULT_LEVEL_CURVE } from "../core/rewards/rewardTypes.js";
import type { Quest, QuestProgress } from "../core/quest/questTypes.js";

function taxon(overrides: Partial<Taxon> = {}): Taxon {
  return {
    id: asTaxonId("taxon-x"),
    sciName: "Taraxacum officinale",
    korName: "민들레",
    rank: "species",
    group: "plant",
    seasonTags: [],
    habitatTags: [],
    riskTags: [],
    rarity: "common",
    ...overrides,
  };
}

test("taxonGroupToKorean: 8종 전부 5종으로 정확히 매핑된다", () => {
  const expected: Record<TaxonGroup, string> = {
    insect: "곤충",
    amphibian: "양서류",
    plant: "식물",
    bird: "조류",
    fungus: "기타",
    reptile: "기타",
    mammal: "기타",
    other: "기타",
  };
  for (const [group, expectedKorean] of Object.entries(expected)) {
    assert.equal(taxonGroupToKorean(group as TaxonGroup), expectedKorean, group);
  }
});

test("rarityToKorean: mock 데이터와 동일한 문구", () => {
  assert.equal(rarityToKorean("common"), "흔해요");
  assert.equal(rarityToKorean("uncommon"), "가끔 보여요");
  assert.equal(rarityToKorean("rare"), "귀해요");
});

test("habitatTagsToDisplay: 빈 배열은 빈 문자열, 여러 개는 · 로 join", () => {
  assert.equal(habitatTagsToDisplay([]), "");
  assert.equal(habitatTagsToDisplay(["park"]), "공원");
  assert.equal(habitatTagsToDisplay(["park", "field"]), "공원·들판");
});

test("taxonToSpeciesCard: 콘텐츠/안전정보 있을 때 정확히 반영, size/active_time은 빈 문자열", () => {
  const t = taxon({ habitatTags: ["park"], rarity: "rare" });
  const similar = taxon({ id: asTaxonId("taxon-y"), sciName: "Aaa bbb", korName: "비슷한종" });
  const safety: SafetyNotice = { showFirst: true, level: "danger", message: "위험해요", riskTags: ["sting_or_bite"] };
  const card = taxonToSpeciesCard(
    t,
    { taxonId: t.id, funFact: "재밌는 사실", observePoints: [], curriculumTags: [] },
    safety,
    [similar],
  );
  assert.equal(card.species_id, "taxon-x");
  assert.equal(card.name, "민들레");
  assert.equal(card.scientific_name, "Taraxacum officinale");
  assert.equal(card.group, "식물");
  assert.equal(card.habitat, "공원");
  assert.equal(card.size, "", "도메인에 없는 필드는 빈 문자열이어야 함(지어내지 않음)");
  assert.equal(card.active_time, "");
  assert.equal(card.rarity, "귀해요");
  assert.equal(card.fun_fact, "재밌는 사실");
  assert.deepEqual(card.similar_species, [{ species_id: "taxon-y", name: "비슷한종" }]);
  assert.equal(card.is_dangerous, true);
  assert.equal(card.safety_notes, "위험해요");
});

test("taxonToSpeciesCard: 콘텐츠/안전정보 없을 때 안전한 기본값", () => {
  const card = taxonToSpeciesCard(taxon(), null, null);
  assert.equal(card.fun_fact, "");
  assert.deepEqual(card.similar_species, []);
  assert.equal(card.is_dangerous, false);
  assert.equal(card.safety_notes, undefined);
});

test("collectionEntryToDexEntry: 미해금이어도 이름은 실제 국명(도감에서 뭘 찾아야 하는지 알 수 있게), creatures만 비어있음", () => {
  const entry = collectionEntryToDexEntry(taxon(), null);
  assert.equal(entry.discovered, false);
  assert.equal(entry.name, "민들레");
  assert.deepEqual(entry.creatures, []);
});

test("collectionEntryToDexEntry: 해금됐으면 실제 이름 + 실제 개체(D단계, 합성 아님)", () => {
  const t = taxon();
  const userId = newUserId();
  const collectionEntry: CollectionEntry = {
    userId,
    taxonId: t.id,
    unlocked: true,
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    timesObserved: 1,
  };
  const creature: Creature = {
    id: newCreatureId(),
    userId,
    taxonId: t.id,
    nickname: "점박이",
    bond: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const entry = collectionEntryToDexEntry(t, collectionEntry, [creature]);
  assert.equal(entry.discovered, true);
  assert.equal(entry.name, "민들레");
  assert.equal(entry.creatures.length, 1);
  assert.equal(entry.creatures[0]?.species_id, "taxon-x");
  assert.equal(entry.creatures[0]?.nickname, "점박이");
  assert.equal(entry.creatures[0]?.discovered_at, "2026-01-01T00:00:00.000Z");
});

test("collectionEntryToDexEntry: 해금됐어도 개체를 안 넘기면(D단계 기본) creatures는 빈 배열", () => {
  const t = taxon();
  const collectionEntry: CollectionEntry = {
    userId: newUserId(),
    taxonId: t.id,
    unlocked: true,
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    timesObserved: 1,
  };
  const entry = collectionEntryToDexEntry(t, collectionEntry);
  assert.deepEqual(entry.creatures, []);
});

test("buildDexCompletion: 백분율 계산 및 0종일 때 0%", () => {
  assert.deepEqual(buildDexCompletion(0, 0), { total: 0, discovered: 0, percentage: 0 });
  assert.deepEqual(buildDexCompletion(40, 15), { total: 40, discovered: 15, percentage: 38 });
});

test("outcomeToIdentifyResponse: high(단일 후보, 위험 없음)", () => {
  const t = taxon();
  const outcome: IdentificationOutcome = {
    tier: "high",
    top: { taxon: t, displayName: "민들레", scientificName: t.sciName, rank: "species", confidence: 0.93 },
    candidates: [{ taxon: t, displayName: "민들레", scientificName: t.sciName, rank: "species", confidence: 0.93 }],
    safety: null,
    source: "mock",
    childMessage: "민들레예요!",
  };
  const res = outcomeToIdentifyResponse(outcome);
  assert.deepEqual(res.candidates, [{ species_id: "taxon-x", confidence: 0.93 }]);
  assert.equal(res.is_dangerous, false);
  assert.equal(res.needs_user_confirmation, false, "high는 사용자 확인 불필요");
});

test("outcomeToIdentifyResponse: medium(여러 후보) -> needs_user_confirmation=true", () => {
  const t1 = taxon({ id: asTaxonId("t1") });
  const t2 = taxon({ id: asTaxonId("t2") });
  const outcome: IdentificationOutcome = {
    tier: "medium",
    top: { taxon: t1, displayName: "a", scientificName: "a", rank: "species", confidence: 0.7 },
    candidates: [
      { taxon: t1, displayName: "a", scientificName: "a", rank: "species", confidence: 0.7 },
      { taxon: t2, displayName: "b", scientificName: "b", rank: "species", confidence: 0.6 },
    ],
    safety: null,
    source: "mock",
    childMessage: "골라볼까요?",
  };
  const res = outcomeToIdentifyResponse(outcome);
  assert.equal(res.candidates.length, 2);
  assert.equal(res.needs_user_confirmation, true);
});

test("outcomeToIdentifyResponse: unknown -> 빈 후보", () => {
  const outcome: IdentificationOutcome = {
    tier: "unknown",
    top: null,
    candidates: [],
    safety: null,
    source: "none",
    childMessage: "모르겠어요",
  };
  const res = outcomeToIdentifyResponse(outcome);
  assert.deepEqual(res.candidates, []);
  assert.equal(res.needs_user_confirmation, false);
});

test("buildSignupResponse: User + email을 UserProfile로 합성", () => {
  const user: User = {
    id: newUserId(),
    plan: "free",
    locationStorageEnabled: false,
    nickname: "탐험가",
    avatar: "fox",
    level: 1,
    xp: 0,
    createdAt: new Date().toISOString(),
  };
  const res = buildSignupResponse("tok123", user, "a@b.com");
  assert.equal(res.access_token, "tok123");
  assert.equal(res.user.user_id, user.id);
  assert.equal(res.user.email, "a@b.com");
  assert.equal(res.user.nickname, "탐험가");
});

test("buildRestoreBundle: garden_layout_present는 항상 false(홈가든 도메인 없음)", () => {
  const res = buildRestoreBundle(5, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(res.dex_count, 5);
  assert.equal(res.garden_layout_present, false);
  assert.equal(res.restored_at, "2026-01-01T00:00:00.000Z");
});

// ── D단계: 개체/배지/퀘스트/XP 매퍼 ────────────────────────────────────────

test("creatureToApiCreature: id/species_id/nickname/discovered_at 매핑", () => {
  const c: Creature = {
    id: newCreatureId(),
    userId: newUserId(),
    taxonId: asTaxonId("taxon-x"),
    nickname: "점박이",
    bond: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const res = creatureToApiCreature(c);
  assert.equal(res.id, c.id as string);
  assert.equal(res.species_id, "taxon-x");
  assert.equal(res.nickname, "점박이");
  assert.equal(res.discovered_at, "2026-01-01T00:00:00.000Z");
});

function badgeDef(): BadgeDefinition {
  return {
    id: "badge-x",
    title: "테스트 배지",
    description: "설명",
    rule: { kind: "firstObservation" },
    xp: 10,
    theme: "수집",
    icon: "🔍",
  };
}

test("badgeDefToApiBadge: earned가 null이면 잠김(unlocked=false, claimed=false)", () => {
  const res = badgeDefToApiBadge(badgeDef(), null);
  assert.equal(res.unlocked, false);
  assert.equal(res.claimed, false);
  assert.equal(res.theme, "수집");
  assert.equal(res.icon, "🔍");
});

test("badgeDefToApiBadge: earned 있고 claimedAt 없으면 unlocked만 true", () => {
  const earned: EarnedBadge = { userId: newUserId(), badgeId: "badge-x", earnedAt: "2026-01-01T00:00:00.000Z" };
  const res = badgeDefToApiBadge(badgeDef(), earned);
  assert.equal(res.unlocked, true);
  assert.equal(res.claimed, false);
});

test("badgeDefToApiBadge: claimedAt 있으면 claimed=true", () => {
  const earned: EarnedBadge = {
    userId: newUserId(),
    badgeId: "badge-x",
    earnedAt: "2026-01-01T00:00:00.000Z",
    claimedAt: "2026-01-02T00:00:00.000Z",
  };
  const res = badgeDefToApiBadge(badgeDef(), earned);
  assert.equal(res.unlocked, true);
  assert.equal(res.claimed, true);
});

function quest(): Quest {
  return {
    id: "quest-x",
    type: "theme",
    title: "테스트 퀘스트",
    description: "설명",
    criteria: { distinctTaxa: 3 },
    reward: { xp: 30, badgeId: "badge-x" },
    activeFrom: "2026-01-01T00:00:00.000Z",
  };
}

test("questToApiQuest: progress 없으면 active, progress=0", () => {
  const res = questToApiQuest(quest(), null);
  assert.equal(res.status, "active");
  assert.equal(res.progress, 0);
  assert.equal(res.target, 3);
  assert.equal(res.reward_badge_id, "badge-x");
  assert.equal(res.hint_species_id, undefined, "지어내지 않고 비워둠");
});

test("questToApiQuest: completed=true, claimedAt 없으면 completed 상태", () => {
  const progress: QuestProgress = {
    userId: newUserId(),
    questId: "quest-x",
    matchedTaxonIds: ["a", "b", "c"],
    completed: true,
    completedAt: "2026-01-01T00:00:00.000Z",
  };
  const res = questToApiQuest(quest(), progress);
  assert.equal(res.status, "completed");
  assert.equal(res.progress, 3);
});

test("questToApiQuest: claimedAt 있으면 claimed 상태", () => {
  const progress: QuestProgress = {
    userId: newUserId(),
    questId: "quest-x",
    matchedTaxonIds: ["a", "b", "c"],
    completed: true,
    completedAt: "2026-01-01T00:00:00.000Z",
    claimedAt: "2026-01-02T00:00:00.000Z",
  };
  const res = questToApiQuest(quest(), progress);
  assert.equal(res.status, "claimed");
});

test("buildXpProfile: level/xp/xp_to_next 계산, leveled_up 전달", () => {
  const user: User = {
    id: newUserId(),
    plan: "free",
    locationStorageEnabled: false,
    nickname: "탐험가",
    avatar: "fox",
    level: 2,
    xp: 80, // thresholds: [0,50,120,...] -> level 2, 다음 문턱 120까지 40 남음
    createdAt: new Date().toISOString(),
  };
  const res = buildXpProfile(user, DEFAULT_LEVEL_CURVE, true);
  assert.equal(res.level, 2);
  assert.equal(res.xp, 80);
  assert.equal(res.xp_to_next, 40);
  assert.equal(res.xp_level_start, 50, "레벨 2 시작 문턱값(thresholds[1])");
  assert.equal(res.leveled_up, true);
});

test("buildXpProfile: 최고 레벨에서는 xp_to_next=0, xp_level_start는 마지막 문턱값", () => {
  const user: User = {
    id: newUserId(),
    plan: "free",
    locationStorageEnabled: false,
    nickname: "탐험가",
    avatar: "fox",
    level: 10,
    xp: 1700, // thresholds 마지막 값(1660) 이상 -> 레벨 10(최고), 더 오를 문턱 없음
    createdAt: new Date().toISOString(),
  };
  const res = buildXpProfile(user, DEFAULT_LEVEL_CURVE);
  assert.equal(res.level, 10);
  assert.equal(res.xp_to_next, 0, "최고 레벨은 다음 문턱이 없어 0");
  assert.equal(res.xp_level_start, 1660, "레벨 10 시작 문턱값(thresholds[9])");
});
