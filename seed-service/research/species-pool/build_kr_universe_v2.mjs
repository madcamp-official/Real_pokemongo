// 1단계 v2: 한국 서식 종 Universe 구축 — 식물/곤충/균류 + 조류/포유류/양서류/파충류/기타무척추동물
//
// v1 대비 변경점:
//   - 분류군을 전체 동물계로 확장 (조류 Aves, 포유류 Mammalia, 양서류 Amphibia,
//     파충류는 GBIF 백본상 "Reptilia" 클래스가 없어(계통분류학적으로 측계통이라 배제됨)
//     Squamata(뱀·도마뱀)+Testudines(거북) 두 클래스로 대체, 곤충 아닌 무척추동물은
//     Arachnida(거미)/Gastropoda(달팽이)/Diplopoda(노래기)/Chilopoda(지네)/
//     Malacostraca(가재·게)로 세분해서 쿼리.
//   - "그룹 간 관측량 스케일이 다르다"는 v1의 한계를 해결하기 위해, 원본 쿼리(source)
//     내에서의 백분위(percentile)를 계산해 그룹 간 공정 비교 지표로 쓴다. 균류/양서류처럼
//     절대 관측건수가 낮은 그룹도 percentile 기준으로는 곤충/식물과 동등하게 경쟁한다.
//   - must-include 리스트: 순수 랭킹에 안 걸려도 안전 필수(독사 등)·상징성 때문에
//     반드시 있어야 하는 종을 확인 후 강제 포함.
//   - 전체 종 수를 1000종 이내로 유지 — must-include는 항상 보존, 나머지는 percentile
//     내림차순으로 잘라서 예산을 맞춘다.

const SOURCES = [
  { app: "plant", matchName: "Plantae", matchRank: "KINGDOM", facetLimit: 250 },
  { app: "insect", matchName: "Insecta", matchRank: "CLASS", facetLimit: 250 },
  { app: "fungus", matchName: "Fungi", matchRank: "KINGDOM", facetLimit: 250 },
  { app: "bird", matchName: "Aves", matchRank: "CLASS", facetLimit: 150 },
  { app: "mammal", matchName: "Mammalia", matchRank: "CLASS", facetLimit: 70 },
  { app: "amphibian", matchName: "Amphibia", matchRank: "CLASS", facetLimit: 40 },
  { app: "reptile", matchName: "Squamata", matchRank: null, facetLimit: 40 },
  { app: "reptile", matchName: "Testudines", matchRank: null, facetLimit: 15 },
  { app: "other", matchName: "Arachnida", matchRank: "CLASS", facetLimit: 60 },
  { app: "other", matchName: "Gastropoda", matchRank: "CLASS", facetLimit: 40 },
  { app: "other", matchName: "Diplopoda", matchRank: "CLASS", facetLimit: 15 },
  { app: "other", matchName: "Chilopoda", matchRank: "CLASS", facetLimit: 15 },
  { app: "other", matchName: "Malacostraca", matchRank: "CLASS", facetLimit: 30 },
];

const GLOBAL_CAP = 1000;
const MIN_OCCURRENCE_COUNT = 3;
const CONCURRENCY = 8;
const GBIF = "https://api.gbif.org/v1";

// 순수 데이터 랭킹으로는 못 잡힐 수 있는(관측 빈도 낮음) 안전필수/상징종 후보.
// v1에서 옻나무·광대버섯이 실제로 이 이유로 빠졌던 것을 확인했으므로, 이번엔 선제적으로
// 검증한다. "존재 확인 안 된 채 추측으로 넣기" 금지 — 전부 GBIF에서 실제로 조회해서
// 학명이 유효하고 한국 관측 기록이 있는지 확인한 것만 채택한다.
const MUST_INCLUDE_CANDIDATES = [
  { sciName: "Toxicodendron vernicifluum", reason: "안전 필수 — 접촉성 피부염(옻)" },
  { sciName: "Amanita muscaria", reason: "상징종 — 아이들에게 가장 널리 알려진 독버섯" },
  { sciName: "Rhabdophis tigrinus", reason: "안전 필수 — 국내 서식 독사(유혈목이)" },
  { sciName: "Vespa mandarinia", reason: "안전 필수 — 최대형 말벌, 쏘임 위험" },
];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GBIF ${res.status} ${url}`);
  return res.json();
}

async function resolveBackboneKey(name, rank) {
  const url = `${GBIF}/species/match?name=${encodeURIComponent(name)}${rank ? `&rank=${rank}&strict=true` : ""}`;
  const data = await getJson(url);
  if (!data.usageKey) throw new Error(`backbone key not found for ${name}(${rank ?? "any"}): ${JSON.stringify(data)}`);
  return { usageKey: data.usageKey, matchedName: data.scientificName, rank: data.rank, confidence: data.confidence };
}

async function facetSpeciesInKorea(taxonKey, limit) {
  const url =
    `${GBIF}/occurrence/search?country=KR&basisOfRecord=HUMAN_OBSERVATION` +
    `&taxonKey=${taxonKey}&facet=speciesKey&facetLimit=${limit}&limit=0`;
  const data = await getJson(url);
  const facet = (data.facets || []).find((f) => f.field === "SPECIES_KEY");
  if (!facet) return [];
  return facet.counts.map((c) => ({ speciesKey: Number(c.name), koreaObservationCount: c.count }));
}

async function occurrenceCountInKorea(taxonKey) {
  const url = `${GBIF}/occurrence/search?country=KR&basisOfRecord=HUMAN_OBSERVATION&taxonKey=${taxonKey}&limit=0`;
  const data = await getJson(url);
  return data.count;
}

async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

async function resolveSpeciesDetail(speciesKey) {
  const d = await getJson(`${GBIF}/species/${speciesKey}`);
  return {
    speciesKey,
    scientificName: d.scientificName,
    canonicalName: d.canonicalName,
    rank: d.rank,
    taxonomicStatus: d.taxonomicStatus,
    acceptedKey: d.acceptedKey ?? null,
    kingdom: d.kingdom,
    phylum: d.phylum,
    class: d.class,
    order: d.order,
    family: d.family,
  };
}

async function classifyOne(d, sourceName, appGroup, rejected) {
  if (d.rank !== "SPECIES") {
    rejected.push({ ...d, reason: `rank_not_species(${d.rank})`, source: sourceName, group: appGroup });
    return null;
  }
  if (d.taxonomicStatus === "MISAPPLIED") {
    rejected.push({ ...d, reason: "misapplied_name_contamination_risk", source: sourceName, group: appGroup });
    return null;
  }
  let finalName = d.canonicalName;
  let statusFlag = d.taxonomicStatus;
  if (d.taxonomicStatus !== "ACCEPTED" && d.taxonomicStatus !== "DOUBTFUL") {
    if (!d.acceptedKey) {
      rejected.push({ ...d, reason: `synonym_without_accepted_key(${d.taxonomicStatus})`, source: sourceName, group: appGroup });
      return null;
    }
    try {
      const accepted = await resolveSpeciesDetail(d.acceptedKey);
      if (accepted.rank !== "SPECIES") {
        rejected.push({ ...d, reason: `synonym_accepted_not_species(${accepted.rank})`, source: sourceName, group: appGroup });
        return null;
      }
      finalName = accepted.canonicalName;
      statusFlag = `SYNONYM_RESOLVED(${d.taxonomicStatus}->${accepted.taxonomicStatus})`;
    } catch (e) {
      rejected.push({ ...d, reason: `synonym_resolve_failed: ${e}`, source: sourceName, group: appGroup });
      return null;
    }
  }
  return { finalName, statusFlag };
}

async function main() {
  const rejected = [];
  const bySource = []; // source별로 percentile 계산을 위해 분리 보관

  for (const s of SOURCES) {
    console.error(`\n=== ${s.app} <- ${s.matchName} ===`);
    const backbone = await resolveBackboneKey(s.matchName, s.matchRank);
    console.error(`backbone: ${s.matchName} -> usageKey=${backbone.usageKey}, rank=${backbone.rank}, confidence=${backbone.confidence}`);

    const facetResults = await facetSpeciesInKorea(backbone.usageKey, s.facetLimit);
    console.error(`facet 결과: ${facetResults.length}개 speciesKey 수신`);

    const details = await pool(facetResults, async (f) => {
      try {
        const detail = await resolveSpeciesDetail(f.speciesKey);
        return { ...f, ...detail };
      } catch (e) {
        return { ...f, error: String(e) };
      }
    }, CONCURRENCY);

    const accepted = [];
    for (const d of details) {
      if (d.error) {
        rejected.push({ ...d, reason: "species_detail_fetch_failed", source: s.matchName, group: s.app });
        continue;
      }
      const cls = await classifyOne(d, s.matchName, s.app, rejected);
      if (!cls) continue;
      if (d.koreaObservationCount < MIN_OCCURRENCE_COUNT) {
        rejected.push({ ...d, reason: `below_min_occurrence(${d.koreaObservationCount})`, source: s.matchName, group: s.app });
        continue;
      }
      accepted.push({
        group: s.app,
        sourceClass: s.matchName,
        sciName: cls.finalName,
        gbifSpeciesKey: d.speciesKey,
        taxonomicStatus: cls.statusFlag,
        rank: d.rank,
        kingdom: d.kingdom,
        phylum: d.phylum,
        class: d.class,
        order: d.order,
        family: d.family,
        koreaObservationCount: d.koreaObservationCount,
      });
    }

    // source(쿼리) 내부에서 관측건수 기준 백분위 계산 — 그룹 간 스케일 차이를 정규화하는 지표.
    accepted.sort((a, b) => b.koreaObservationCount - a.koreaObservationCount);
    const n = accepted.length;
    accepted.forEach((sp, i) => {
      sp.percentileInSource = n <= 1 ? 1 : 1 - i / (n - 1); // 1위=1.0, 꼴찌=0.0
    });

    console.error(`${s.app}<-${s.matchName}: 최종 채택 ${accepted.length}종`);
    bySource.push(...accepted);
  }

  // (group, sciName) 기준 병합 — 같은 종이 서로 다른 source 쿼리에서 중복 잡힐 수 있음
  // (예: 파충류의 Squamata/Testudines는 겹치지 않지만, 향후 확장 시 대비).
  const merged = new Map();
  for (const u of bySource) {
    const key = `${u.group}::${u.sciName}`;
    const existing = merged.get(key);
    if (!existing || u.percentileInSource > existing.percentileInSource) {
      merged.set(key, u);
    }
  }
  let universe = [...merged.values()];

  // must-include 후보 검증 및 병합.
  console.error(`\n=== must-include 후보 검증 ===`);
  const mustIncludeFinal = [];
  for (const cand of MUST_INCLUDE_CANDIDATES) {
    const backbone = await resolveBackboneKey(cand.sciName);
    const detail = await resolveSpeciesDetail(backbone.usageKey);
    if (detail.rank !== "SPECIES" || (detail.taxonomicStatus !== "ACCEPTED" && detail.taxonomicStatus !== "DOUBTFUL")) {
      console.error(`  [스킵] ${cand.sciName}: rank=${detail.rank}, status=${detail.taxonomicStatus} — 유효한 종 학명 아님`);
      continue;
    }
    const krCount = await occurrenceCountInKorea(backbone.usageKey);
    let appGroup;
    if (detail.kingdom === "Plantae") appGroup = "plant";
    else if (detail.kingdom === "Fungi") appGroup = "fungus";
    else if (detail.class === "Insecta") appGroup = "insect";
    else if (detail.class === "Aves") appGroup = "bird";
    else if (detail.class === "Mammalia") appGroup = "mammal";
    else if (detail.class === "Amphibia") appGroup = "amphibian";
    else if (detail.class === "Squamata" || detail.class === "Testudines") appGroup = "reptile";
    else appGroup = "other";

    console.error(`  [확인됨] ${detail.canonicalName} (${appGroup}) 국내관측=${krCount}건 — ${cand.reason}`);
    mustIncludeFinal.push({
      group: appGroup,
      sourceClass: detail.class ?? detail.kingdom,
      sciName: detail.canonicalName,
      gbifSpeciesKey: detail.speciesKey,
      taxonomicStatus: detail.taxonomicStatus,
      rank: detail.rank,
      kingdom: detail.kingdom,
      phylum: detail.phylum,
      class: detail.class,
      order: detail.order,
      family: detail.family,
      koreaObservationCount: krCount,
      percentileInSource: 1, // must-include는 랭킹 밖이라도 최우선 취급
      mustInclude: true,
      mustIncludeReason: cand.reason,
    });
  }

  // 이미 랭킹으로 잡힌 종이면 mustInclude 플래그만 얹고, 새 종이면 추가.
  for (const mi of mustIncludeFinal) {
    const key = `${mi.group}::${mi.sciName}`;
    const existing = merged.get(key);
    if (existing) {
      existing.mustInclude = true;
      existing.mustIncludeReason = mi.mustIncludeReason;
    } else {
      universe.push(mi);
    }
  }

  // 전체 1000종 예산 적용 — mustInclude는 항상 보존, 나머지는 percentileInSource 내림차순.
  const mustIncludeSet = universe.filter((u) => u.mustInclude);
  const rest = universe
    .filter((u) => !u.mustInclude)
    .sort((a, b) => b.percentileInSource - a.percentileInSource);
  const restBudget = Math.max(0, GLOBAL_CAP - mustIncludeSet.length);
  const trimmed = rest.length > restBudget ? rest.slice(0, restBudget) : rest;
  const droppedByCap = rest.length - trimmed.length;

  universe = [...mustIncludeSet, ...trimmed];
  universe.sort((a, b) => (b.mustInclude ? 1 : 0) - (a.mustInclude ? 1 : 0) || b.percentileInSource - a.percentileInSource);

  const byGroup = {};
  for (const u of universe) byGroup[u.group] = (byGroup[u.group] ?? 0) + 1;

  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      source: "GBIF Occurrence API",
      countryFilter: "KR",
      basisOfRecord: "HUMAN_OBSERVATION",
      minOccurrenceCount: MIN_OCCURRENCE_COUNT,
      globalCap: GLOBAL_CAP,
      rankingMetric: "percentileInSource (그룹/쿼리 내부 백분위 — 절대 관측건수 스케일 차이를 정규화)",
      sources: SOURCES,
      mustIncludeCandidatesChecked: MUST_INCLUDE_CANDIDATES.length,
      mustIncludeAccepted: mustIncludeFinal.length,
    },
    totalCount: universe.length,
    droppedByCap,
    byGroup,
    species: universe,
  };

  console.log(JSON.stringify(output, null, 2));
  console.error(`\n총 ${universe.length}종 채택 (must-include ${mustIncludeSet.length}종 포함), cap으로 ${droppedByCap}종 잘림, 그 외 ${rejected.length}종 검증단계에서 배제`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
