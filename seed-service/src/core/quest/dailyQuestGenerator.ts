/**
 * 데일리 퀘스트 생성기 (F7 §5 "매일 다르지만 뜬금없지 않게").
 *
 * 완전 무작위 조합(예: "파충류이면서 겨울에만 보이는 3종"처럼 실제로는 같이 묶이지 않는
 * 조합) 대신, 실제 종 데이터에서 진짜로 공유되는 축(같은 분류군+서식지, 같은 분류군+계절)
 * 으로 "군집"을 먼저 만들고 그중 하나를 날짜로 시드된 난수로 고른다. 그래서 결과는 항상
 * "실제로 같은 서식지/계절/분류군을 공유하는 종들"의 조합이다. 후보가 2종 미만인 군집은
 * 아예 만들지 않는다(완료 불가능한 퀘스트 방지).
 *
 * 날짜(Asia/Seoul 기준) 하나에 항상 같은 결과를 내는 순수 함수다 — 그래서 하루 동안 같은
 * 유저에게 여러 번 호출돼도(GET /quests 매 요청마다) 결과가 흔들리지 않는다. 다만 여러
 * 유저가 "동일한 오늘의 퀘스트"에 진행률을 쌓으려면 quest.id가 안정적이어야 하므로,
 * 호출 측(QuestEngine)이 이 함수의 결과를 한 번 만들어 저장소에 박아둔다.
 */
import type { Taxon, TaxonGroup, Habitat, Season } from "../domain/types.js";
import type { Quest } from "./questTypes.js";
import { seoulDateKey, seoulDayRangeIso } from "./season.js";

const GROUP_LABEL: Record<TaxonGroup, string> = {
  insect: "곤충",
  plant: "식물",
  bird: "새",
  fungus: "버섯",
  reptile: "파충류",
  amphibian: "양서류",
  mammal: "포유류",
  other: "생물",
};

const HABITAT_LABEL: Record<Habitat, string> = {
  neighborhood: "우리 동네",
  park: "공원",
  mountain: "산",
  waterside: "물가",
  garden: "화단",
  field: "들판",
};

const SEASON_LABEL: Record<Season, string> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};

interface Cluster {
  taxonCount: number;
  criteria: { group: TaxonGroup; habitat?: Habitat; season?: Season };
  title: (n: number) => string;
  description: (n: number) => string;
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — 결정론적(같은 seed면 항상 같은 수열) 의사난수. 암호 용도 아님. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function buildClusters(taxa: Taxon[]): Cluster[] {
  const byGroup = new Map<TaxonGroup, number>();
  const byGroupHabitat = new Map<string, number>();
  const byGroupSeason = new Map<string, number>();
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);

  for (const t of taxa) {
    byGroup.set(t.group, (byGroup.get(t.group) ?? 0) + 1);
    for (const h of t.habitatTags) bump(byGroupHabitat, `${t.group}|${h}`);
    for (const s of t.seasonTags) bump(byGroupSeason, `${t.group}|${s}`);
  }

  const clusters: Cluster[] = [];

  for (const [group, count] of byGroup) {
    if (count < 2) continue;
    const label = GROUP_LABEL[group];
    clusters.push({
      taxonCount: count,
      criteria: { group },
      title: (n) => `오늘의 ${label} 친구 ${n}종 찾기`,
      description: (n) => `${label} 친구를 ${n}종 만나보아요.`,
    });
  }

  for (const [key, count] of byGroupHabitat) {
    if (count < 2) continue;
    const [group, habitat] = key.split("|") as [TaxonGroup, Habitat];
    const gLabel = GROUP_LABEL[group];
    const hLabel = HABITAT_LABEL[habitat];
    clusters.push({
      taxonCount: count,
      criteria: { group, habitat },
      title: (n) => `${hLabel} ${gLabel} ${n}종 찾기`,
      description: (n) => `${hLabel}에서 만날 수 있는 ${gLabel} 친구를 ${n}종 찾아보아요.`,
    });
  }

  for (const [key, count] of byGroupSeason) {
    if (count < 2) continue;
    const [group, season] = key.split("|") as [TaxonGroup, Season];
    const gLabel = GROUP_LABEL[group];
    const sLabel = SEASON_LABEL[season];
    clusters.push({
      taxonCount: count,
      criteria: { group, season },
      title: (n) => `${sLabel}에 만나는 ${gLabel} ${n}종`,
      description: (n) => `${sLabel}에 볼 수 있는 ${gLabel} 친구 ${n}종을 관찰해요.`,
    });
  }

  return clusters;
}

/** 오늘(Asia/Seoul) 하루짜리 데일리 퀘스트를 결정론적으로 생성한다. */
export function generateDailyQuest(taxa: Taxon[], now: Date = new Date()): Quest {
  const dateKey = seoulDateKey(now);
  const rng = mulberry32(hashSeed(`daily-quest:${dateKey}`));

  const clusters = buildClusters(taxa);
  if (clusters.length === 0) {
    throw new Error("generateDailyQuest: 데일리 퀘스트를 만들 종 후보가 없습니다.");
  }
  const cluster = pick(rng, clusters);

  const maxN = Math.min(3, cluster.taxonCount);
  const minN = Math.min(2, maxN);
  const distinctTaxa = minN === maxN ? maxN : minN + Math.floor(rng() * (maxN - minN + 1));

  const { from, to } = seoulDayRangeIso(now);

  return {
    id: `quest-daily-${dateKey}`,
    type: "daily",
    title: cluster.title(distinctTaxa),
    description: cluster.description(distinctTaxa),
    criteria: { distinctTaxa, ...cluster.criteria },
    reward: { xp: 10 + distinctTaxa * 5 },
    activeFrom: from,
    activeTo: to,
  };
}
