// 1단계 v3: v2 대비 변경
//   - 확정 오염종 제거(Pica pica) + 미해결 위험후보 3종(Buteo buteo, Larus argentatus,
//     Corvus corone)도 이번엔 사용자 지시로 완전 배제(EXCLUDE_LIST).
//   - 파충류/양서류/포유류는 "개체수가 적은 종 최대한 배제" 요청에 따라 그룹별로
//     별도의(더 엄격한) 최소 관측건수 문턱값을 적용(STRICT_MIN_COUNT).
//   - 어류 신규 추가. GBIF 백본은 "Actinopterygii"를 클래스 노드로 안 쓰고(조회해보니
//     species/match 백본 매칭 자체가 안 됨 — Reptilia와 같은 부류의 계통분류 생략 사례),
//     경골어류 목(order)들이 곧바로 phylum Chordata 밑에 걸려 있어 주요 목 단위로 개별 조회.
//     TaxonGroup enum엔 "fish" 슬롯이 없어 일단 "other"에 담되 order 필드로 구분 가능하게 함
//     — 스키마에 전용 그룹을 넣을지는 별도 결정 필요(README에 명시).
//   - 확보된 예산을 기존 그룹(식물/곤충/균류/조류/기타무척추동물) facetLimit 상향으로 배분해
//     cap 때문에 빠졌던 흔한 종을 추가로 채움.

const SOURCES = [
  { app: "plant", matchName: "Plantae", matchRank: "KINGDOM", facetLimit: 300 },
  { app: "insect", matchName: "Insecta", matchRank: "CLASS", facetLimit: 300 },
  { app: "fungus", matchName: "Fungi", matchRank: "KINGDOM", facetLimit: 280 },
  { app: "bird", matchName: "Aves", matchRank: "CLASS", facetLimit: 180 },
  { app: "mammal", matchName: "Mammalia", matchRank: "CLASS", facetLimit: 70 },
  { app: "amphibian", matchName: "Amphibia", matchRank: "CLASS", facetLimit: 30 },
  { app: "reptile", matchName: "Squamata", matchRank: null, facetLimit: 40 },
  { app: "reptile", matchName: "Testudines", matchRank: null, facetLimit: 15 },
  { app: "other", matchName: "Arachnida", matchRank: "CLASS", facetLimit: 70 },
  { app: "other", matchName: "Gastropoda", matchRank: "CLASS", facetLimit: 50 },
  { app: "other", matchName: "Diplopoda", matchRank: "CLASS", facetLimit: 15 },
  { app: "other", matchName: "Chilopoda", matchRank: "CLASS", facetLimit: 15 },
  { app: "other", matchName: "Malacostraca", matchRank: "CLASS", facetLimit: 40 },
  // 어류 — 클래스 노드가 없어 목(order) 단위로 개별 조회. usageKey는 사전에 species/44/children
  // (phylum Chordata)로 실제 목록을 조회해서 확인한 값(추측 아님).
  { app: "other", matchName: "Cypriniformes", matchRank: null, facetLimit: 60, taxonKeyOverride: 1153 },
  { app: "other", matchName: "Perciformes", matchRank: null, facetLimit: 40, taxonKeyOverride: 587 },
  { app: "other", matchName: "Anguilliformes", matchRank: null, facetLimit: 10, taxonKeyOverride: 495 },
  { app: "other", matchName: "Cyprinodontiformes", matchRank: null, facetLimit: 10, taxonKeyOverride: 547 },
  { app: "other", matchName: "Osmeriformes", matchRank: null, facetLimit: 10, taxonKeyOverride: 1068 },
  { app: "other", matchName: "Gasterosteiformes", matchRank: null, facetLimit: 10, taxonKeyOverride: 550 },
  // v3 추가분 — species/44/children(phylum Chordata) 전체를 다시 훑어서 빠뜨린 어류 목을 보충.
  // Beloniformes를 빠뜨려서 송사리(Oryzias latipes, 국내관측 1409건 — 초등교과서에도 나오는
  // 상징종)가 통째로 누락됐던 걸 뒤늦게 발견 — Siluriformes(메기)도 마찬가지로 누락돼 있었음.
  { app: "other", matchName: "Beloniformes", matchRank: null, facetLimit: 15, taxonKeyOverride: 498 },
  { app: "other", matchName: "Siluriformes", matchRank: null, facetLimit: 20, taxonKeyOverride: 708 },
  { app: "other", matchName: "Synbranchiformes", matchRank: null, facetLimit: 5, taxonKeyOverride: 889 },
  { app: "other", matchName: "Salmoniformes", matchRank: null, facetLimit: 10, taxonKeyOverride: 1313 },
  { app: "other", matchName: "Pleuronectiformes", matchRank: null, facetLimit: 10, taxonKeyOverride: 588 },
  { app: "other", matchName: "Tetraodontiformes", matchRank: null, facetLimit: 10, taxonKeyOverride: 772 },
  { app: "other", matchName: "Syngnathiformes", matchRank: null, facetLimit: 5, taxonKeyOverride: 773 },
  { app: "other", matchName: "Scorpaeniformes", matchRank: null, facetLimit: 10, taxonKeyOverride: 590 },
];

const GLOBAL_CAP = 1000;
const MIN_OCCURRENCE_COUNT = 3;
// "개체수가 적은 종은 최대한 배제" — 파충류/양서류/포유류만 그룹별로 더 엄격한 문턱값 적용.
// 값은 각 그룹의 실제 관측건수 분포를 직접 확인해서(v2 산출물) 정한 것 — 예: 포유류는 100
// 밑으로는 고래·물범 등 "이웃에서 못 보는" 해양포유류나 극희귀 박쥐/설치류가 몰려있었음.
const STRICT_MIN_COUNT = { reptile: 50, amphibian: 200, mammal: 100 };
const EXCLUDE_LIST = new Set(["Buteo buteo", "Larus argentatus", "Corvus corone", "Pica pica"]);
const CONCURRENCY = 8;
const GBIF = "https://api.gbif.org/v1";

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
  if (EXCLUDE_LIST.has(d.canonicalName)) {
    rejected.push({ ...d, reason: "manually_excluded", source: sourceName, group: appGroup });
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
      if (EXCLUDE_LIST.has(accepted.canonicalName)) {
        rejected.push({ ...d, reason: "manually_excluded(via synonym)", source: sourceName, group: appGroup });
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
  const bySource = [];

  for (const s of SOURCES) {
    console.error(`\n=== ${s.app} <- ${s.matchName} ===`);
    let usageKey;
    if (s.taxonKeyOverride) {
      usageKey = s.taxonKeyOverride;
      console.error(`taxonKeyOverride 사용: ${s.matchName} -> ${usageKey}`);
    } else {
      const backbone = await resolveBackboneKey(s.matchName, s.matchRank);
      usageKey = backbone.usageKey;
      console.error(`backbone: ${s.matchName} -> usageKey=${usageKey}, rank=${backbone.rank}, confidence=${backbone.confidence}`);
    }

    const facetResults = await facetSpeciesInKorea(usageKey, s.facetLimit);
    console.error(`facet 결과: ${facetResults.length}개 speciesKey 수신`);

    const details = await pool(facetResults, async (f) => {
      try {
        const detail = await resolveSpeciesDetail(f.speciesKey);
        return { ...f, ...detail };
      } catch (e) {
        return { ...f, error: String(e) };
      }
    }, CONCURRENCY);

    const minCount = STRICT_MIN_COUNT[s.app] ?? MIN_OCCURRENCE_COUNT;
    const accepted = [];
    for (const d of details) {
      if (d.error) {
        rejected.push({ ...d, reason: "species_detail_fetch_failed", source: s.matchName, group: s.app });
        continue;
      }
      const cls = await classifyOne(d, s.matchName, s.app, rejected);
      if (!cls) continue;
      if (d.koreaObservationCount < minCount) {
        rejected.push({ ...d, reason: `below_min_occurrence(${d.koreaObservationCount}<${minCount})`, source: s.matchName, group: s.app });
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

    accepted.sort((a, b) => b.koreaObservationCount - a.koreaObservationCount);
    const n = accepted.length;
    accepted.forEach((sp, i) => {
      sp.percentileInSource = n <= 1 ? 1 : 1 - i / (n - 1);
    });

    console.error(`${s.app}<-${s.matchName}: 최종 채택 ${accepted.length}종 (minCount=${minCount})`);
    bySource.push(...accepted);
  }

  const merged = new Map();
  for (const u of bySource) {
    const key = `${u.group}::${u.sciName}`;
    const existing = merged.get(key);
    if (!existing || u.percentileInSource > existing.percentileInSource) {
      merged.set(key, u);
    }
  }
  let universe = [...merged.values()];

  console.error(`\n=== must-include 후보 검증 ===`);
  const mustIncludeFinal = [];
  for (const cand of MUST_INCLUDE_CANDIDATES) {
    const backbone = await resolveBackboneKey(cand.sciName);
    const detail = await resolveSpeciesDetail(backbone.usageKey);
    if (detail.rank !== "SPECIES" || (detail.taxonomicStatus !== "ACCEPTED" && detail.taxonomicStatus !== "DOUBTFUL")) {
      console.error(`  [스킵] ${cand.sciName}: rank=${detail.rank}, status=${detail.taxonomicStatus}`);
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
      percentileInSource: 1,
      mustInclude: true,
      mustIncludeReason: cand.reason,
    });
  }

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
      strictMinCountByGroup: STRICT_MIN_COUNT,
      excludeList: [...EXCLUDE_LIST],
      globalCap: GLOBAL_CAP,
      rankingMetric: "percentileInSource (그룹/쿼리 내부 백분위)",
      sources: SOURCES,
      mustIncludeAccepted: mustIncludeFinal.length,
      note: "어류는 GBIF 백본에 class 노드가 없어(Actinopterygii 미사용) order 단위로 개별 조회, TaxonGroup 스키마에 'fish' 슬롯이 없어 group='other'로 담되 sourceClass/order 필드로 구분 가능.",
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
