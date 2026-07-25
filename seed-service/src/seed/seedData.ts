/**
 * 시드 데이터 (개발/데모용 예시).
 *
 * 실제 MVP 종 100종 리스트·콘텐츠는 별도 확정 대상(명세서 §15).
 * 여기서는 파이프라인을 돌려보기 위한 소수의 한국 종/퀘스트/배지/콘텐츠만 담는다.
 * 종 마스터 원천은 TODO(제공 필요): 국가생물종지식정보시스템 등 공공 데이터.
 */
import type { Taxon } from "../core/domain/types.js";
import { asTaxonId } from "../core/domain/ids.js";
import type { Quest } from "../core/quest/questTypes.js";
import type { BadgeDefinition } from "../core/rewards/rewardTypes.js";
import type { SpeciesContent } from "../child/content/ContentCardService.js";

export const SEED_TAXA: Taxon[] = [
  {
    id: asTaxonId("taxon-dandelion"),
    sciName: "Taraxacum officinale",
    korName: "민들레",
    aliases: ["yellow", "노란꽃"],
    rank: "species",
    group: "plant",
    seasonTags: ["spring"],
    habitatTags: ["neighborhood", "park", "field"],
    riskTags: [],
    rarity: "common",
  },
  {
    id: asTaxonId("taxon-forsythia"),
    sciName: "Forsythia koreana",
    korName: "개나리",
    aliases: ["yellow", "노란꽃"],
    rank: "species",
    group: "plant",
    seasonTags: ["spring"],
    habitatTags: ["neighborhood", "park"],
    riskTags: [],
    rarity: "common",
  },
  {
    id: asTaxonId("taxon-dayflower"),
    sciName: "Commelina communis",
    korName: "닭의장풀",
    aliases: ["blue"],
    rank: "species",
    group: "plant",
    seasonTags: ["summer"],
    habitatTags: ["field", "waterside"],
    riskTags: [],
    rarity: "common",
  },
  {
    id: asTaxonId("taxon-cabbage-white"),
    sciName: "Pieris rapae",
    korName: "배추흰나비",
    aliases: ["wing", "날개"],
    rank: "species",
    group: "insect",
    seasonTags: ["spring", "summer"],
    habitatTags: ["field", "garden", "park"],
    riskTags: [],
    rarity: "common",
  },
  {
    id: asTaxonId("taxon-ladybug"),
    sciName: "Harmonia axyridis",
    korName: "무당벌레",
    aliases: ["wing", "날개"],
    rank: "species",
    group: "insect",
    seasonTags: ["spring", "summer", "autumn"],
    habitatTags: ["garden", "field", "neighborhood"],
    riskTags: [],
    rarity: "common",
  },
  {
    id: asTaxonId("taxon-honeybee"),
    sciName: "Apis mellifera",
    korName: "꿀벌",
    aliases: ["wing", "날개"],
    rank: "species",
    group: "insect",
    seasonTags: ["spring", "summer"],
    habitatTags: ["garden", "park", "field"],
    riskTags: ["sting_or_bite"], // 안전 안내 대상
    rarity: "common",
  },
  {
    id: asTaxonId("taxon-lacquer-tree"),
    sciName: "Toxicodendron vernicifluum",
    korName: "옻나무",
    rank: "species",
    group: "plant",
    seasonTags: ["summer", "autumn"],
    habitatTags: ["mountain"],
    riskTags: ["contact_dermatitis"], // 만지면 피부염
    rarity: "uncommon",
  },
  {
    id: asTaxonId("taxon-fly-agaric"),
    sciName: "Amanita muscaria",
    korName: "광대버섯",
    rank: "species",
    group: "fungus", // 식용 판정 절대 안 함
    seasonTags: ["autumn"],
    habitatTags: ["mountain"],
    riskTags: ["toxic_if_eaten"],
    rarity: "uncommon",
  },
];

export const SEED_QUESTS: Quest[] = [
  {
    id: "quest-spring-yellow-flowers",
    type: "seasonal",
    title: "봄의 노란 꽃 3종을 찾아라 🌼",
    description: "봄에 피는 노란 꽃 세 가지를 관찰해요.",
    criteria: {
      distinctTaxa: 3,
      season: "spring",
      group: "plant",
      tagAny: ["yellow", "노란꽃"],
    },
    reward: { xp: 30, badgeId: "badge-spring-explorer", cosmetic: "봄 배경" },
    activeFrom: "2026-01-01T00:00:00.000Z",
    curriculumTags: ["통합교과-봄"],
  },
  {
    id: "quest-winged-friends",
    type: "theme",
    title: "날개 달린 친구 3종 🦋",
    description: "날개가 있는 곤충 친구를 세 종류 만나요.",
    criteria: { distinctTaxa: 3, group: "insect", tagAny: ["wing", "날개"] },
    reward: { xp: 30, badgeId: "badge-bug-friend" },
    activeFrom: "2026-01-01T00:00:00.000Z",
    curriculumTags: ["과학-동물의생활"],
  },
];

export const SEED_BADGES: BadgeDefinition[] = [
  {
    id: "badge-first-find",
    title: "첫 발견!",
    description: "처음으로 생물을 관찰했어요.",
    rule: { kind: "firstObservation" },
    xp: 5,
    theme: "수집",
    icon: "🔍",
  },
  {
    id: "badge-collector-10",
    title: "꼬마 수집가",
    description: "관찰 10번 달성.",
    rule: { kind: "totalObservations", count: 10 },
    xp: 20,
    theme: "수집",
    icon: "📚",
  },
  {
    id: "badge-bug-master",
    title: "곤충 박사",
    description: "서로 다른 곤충 3종을 모았어요.",
    rule: { kind: "distinctTaxaInGroup", group: "insect", count: 3 },
    xp: 25,
    theme: "탐험",
    icon: "🧭",
  },
  {
    id: "badge-spring-explorer",
    title: "봄 탐험가",
    description: "봄 퀘스트를 완료했어요.",
    rule: { kind: "questCount", count: 1 },
    xp: 15,
    theme: "탐험",
    icon: "🌱",
  },
  {
    id: "badge-bug-friend",
    title: "곤충 친구",
    description: "날개 퀘스트를 완료했어요.",
    rule: { kind: "questCount", count: 2 },
    xp: 15,
    theme: "우정",
    icon: "🦋",
  },
];

export const SEED_CONTENT: SpeciesContent[] = [
  {
    taxonId: asTaxonId("taxon-dandelion"),
    funFact: "민들레 씨앗은 바람을 타고 멀리 날아가요. 후~ 불어볼까요?",
    observePoints: ["노란 꽃잎을 세어봐요", "솜털 씨앗을 살펴봐요"],
    narrationRef: undefined, // TODO(제공 필요): 음성 파일
    quiz: [
      {
        q: "민들레 씨앗은 무엇을 타고 날아갈까요?",
        options: ["물", "바람", "자동차"],
        answerIndex: 1,
      },
    ],
    curriculumTags: ["통합교과-봄"],
  },
  {
    taxonId: asTaxonId("taxon-honeybee"),
    funFact: "꿀벌은 꽃에서 꿀을 모아요. 하지만 쏘일 수 있으니 멀리서 봐요.",
    observePoints: ["노란 줄무늬를 봐요", "꽃 위에서 무엇을 하는지 봐요"],
    curriculumTags: ["과학-동물의생활"],
  },
];

/**
 * F16 홈가든 — 타일-종 호환성(그룹→배치 가능한 타일). 계산값이 아니라 저작 콘텐츠(제품 결정,
 * db/schema.sql 9번 섹션 주석 참고) — 지도의 blobs와 같은 성격이라 정적 상수로 둔다.
 * 프론트(app/src/api/api.ts) TaxonGroup 4종 한글 라벨과 TileType 5종 한글 라벨을 그대로 키/값으로
 * 쓴다 — 이 파일이 도메인 코드가 아니라 순수 authored config라 앱 DTO 라벨을 직접 써도 괜찮다.
 * app/src/mocks/mockData.ts의 mockTileCompatibility와 동일한 값.
 */
export type GardenTaxonGroupLabel = "곤충" | "양서류" | "식물" | "기타";
export const TILE_COMPATIBILITY: Record<GardenTaxonGroupLabel, string[]> = {
  곤충: ["잔디", "꽃밭"],
  양서류: ["물웅덩이", "잔디"],
  식물: ["흙", "꽃밭"],
  기타: ["흙", "잔디", "돌"],
};
