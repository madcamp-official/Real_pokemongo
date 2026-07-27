// 1단계: 한국 서식 종 Universe 구축 (GBIF Occurrence API 기반)
//
// 방법론:
//   - country=KR 필터로 "한국 내에서 실제로 관측된" 기록만 집계한다(해외 관측 데이터가
//     "흔함" 판단에 섞이는 것을 원천 차단).
//   - basisOfRecord=HUMAN_OBSERVATION 으로 한정해 "사람이 실제로 목격/기록한" 관측만
//     센다(박물관 표본 채집 편향 제거 — 연구자가 채집하기 쉬운 희귀종이 표본 수가 많아서
//     "흔하다"고 착시되는 것을 방지).
//   - 상위분류군(Plantae/Insecta/Fungi)별로 facet=speciesKey 로 국내 관측건수 상위 N종을
//     뽑는다 — 이게 "후보 universe"와 "흔함 가중치"를 동시에 준다.
//   - 각 speciesKey를 species/{key}로 resolve해서 정확한 학명·분류학적 상태(synonym 여부)를
//     검증한다(추측 금지 — 반드시 GBIF backbone에서 직접 조회).

const GROUPS = [
  { app: "plant", matchName: "Plantae", matchRank: "KINGDOM" },
  { app: "insect", matchName: "Insecta", matchRank: "CLASS" },
  { app: "fungus", matchName: "Fungi", matchRank: "KINGDOM" },
];

const FACET_LIMIT = 250; // 그룹당 국내 관측건수 상위 250종 후보
const MIN_OCCURRENCE_COUNT = 3; // 단발성/오류성 기록 노이즈 제거용 최소 임계치
const CONCURRENCY = 8;
const GBIF = "https://api.gbif.org/v1";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GBIF ${res.status} ${url}`);
  return res.json();
}

async function resolveBackboneKey(name, rank) {
  const url = `${GBIF}/species/match?name=${encodeURIComponent(name)}&rank=${rank}&strict=true`;
  const data = await getJson(url);
  if (!data.usageKey) throw new Error(`backbone key not found for ${name} (${rank}): ${JSON.stringify(data)}`);
  return { usageKey: data.usageKey, matchedName: data.scientificName, confidence: data.confidence };
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

async function main() {
  const universe = [];
  const rejected = [];

  for (const g of GROUPS) {
    console.error(`\n=== ${g.app} (${g.matchName}) ===`);
    const backbone = await resolveBackboneKey(g.matchName, g.matchRank);
    console.error(`backbone key resolved: ${g.matchName} -> usageKey=${backbone.usageKey} (matched: ${backbone.matchedName}, confidence=${backbone.confidence})`);

    const facetResults = await facetSpeciesInKorea(backbone.usageKey, FACET_LIMIT);
    console.error(`facet 결과: 국내 관측 speciesKey ${facetResults.length}개 수신`);

    const details = await pool(facetResults, async (f) => {
      try {
        const detail = await resolveSpeciesDetail(f.speciesKey);
        return { ...f, ...detail };
      } catch (e) {
        return { ...f, error: String(e) };
      }
    }, CONCURRENCY);

    for (const d of details) {
      if (d.error) {
        rejected.push({ ...d, reason: "species_detail_fetch_failed", group: g.app });
        continue;
      }
      if (d.rank !== "SPECIES") {
        rejected.push({ ...d, reason: `rank_not_species(${d.rank})`, group: g.app });
        continue;
      }
      // MISAPPLIED: 이름이 다른(엉뚱한) 종에 잘못 적용된 경우 — 오염 위험이 실재하므로 배제.
      // SYNONYM 계열: 같은 종의 다른 이름일 뿐이므로 acceptedKey로 정명(正名)을 다시 조회해
      // 그 이름으로 채택한다(이렇게 안 하면 GBIF 백본 명명 방식 차이 때문에 실제로는 흔한
      // 종인데도 후보군에서 통째로 빠지는 손실이 생김 — 조건3 "흔한 종 누락 금지"에 위배).
      // DOUBTFUL: "이 이름이 유효한 학명인지" GBIF 편집진 사이에 이견이 있다는 뜻이지,
      // 한국에 안 산다거나 다른 종과 혼동됐다는 뜻이 아니다 — 채택하되 플래그만 남겨
      // 사람이 나중에 검토하게 한다.
      let finalName = d.canonicalName;
      let statusFlag = d.taxonomicStatus;
      if (d.taxonomicStatus === "MISAPPLIED") {
        rejected.push({ ...d, reason: `misapplied_name_contamination_risk`, group: g.app });
        continue;
      }
      if (d.taxonomicStatus !== "ACCEPTED" && d.taxonomicStatus !== "DOUBTFUL") {
        // SYNONYM 계열
        if (!d.acceptedKey) {
          rejected.push({ ...d, reason: `synonym_without_accepted_key(${d.taxonomicStatus})`, group: g.app });
          continue;
        }
        try {
          const accepted = await resolveSpeciesDetail(d.acceptedKey);
          if (accepted.rank !== "SPECIES") {
            rejected.push({ ...d, reason: `synonym_accepted_not_species(${accepted.rank})`, group: g.app });
            continue;
          }
          finalName = accepted.canonicalName;
          statusFlag = `SYNONYM_RESOLVED(${d.taxonomicStatus}->${accepted.taxonomicStatus})`;
        } catch (e) {
          rejected.push({ ...d, reason: `synonym_resolve_failed: ${e}`, group: g.app });
          continue;
        }
      }
      if (d.koreaObservationCount < MIN_OCCURRENCE_COUNT) {
        rejected.push({ ...d, reason: `below_min_occurrence(${d.koreaObservationCount})`, group: g.app });
        continue;
      }
      universe.push({
        group: g.app,
        sciName: finalName,
        gbifSpeciesKey: d.speciesKey,
        taxonomicStatus: statusFlag,
        rank: d.rank,
        kingdom: d.kingdom,
        phylum: d.phylum,
        class: d.class,
        order: d.order,
        family: d.family,
        koreaObservationCount: d.koreaObservationCount,
      });
    }
    console.error(`${g.app}: 최종 채택 ${details.filter(d => !d.error).length - rejected.filter(r => r.group === g.app).length}종 / 후보 ${details.length}종`);
  }

  // synonym 정명화 과정에서 같은 종이 두 번(원래 ACCEPTED 항목 + SYNONYM_RESOLVED 항목)
  // 들어올 수 있어 (group, sciName) 기준으로 병합한다 — 관측건수는 합산(같은 생물종에
  // 대한 서로 다른 이름표를 쓴 기록이 합쳐지는 것이므로 합산이 방법론적으로 맞음).
  const merged = new Map();
  for (const u of universe) {
    const key = `${u.group}::${u.sciName}`;
    const existing = merged.get(key);
    if (existing) {
      existing.koreaObservationCount += u.koreaObservationCount;
      existing.mergedFrom = [...(existing.mergedFrom ?? [existing.gbifSpeciesKey]), u.gbifSpeciesKey];
    } else {
      merged.set(key, { ...u });
    }
  }
  const dedupedUniverse = [...merged.values()];
  dedupedUniverse.sort((a, b) => b.koreaObservationCount - a.koreaObservationCount);
  universe.length = 0;
  universe.push(...dedupedUniverse);

  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      source: "GBIF Occurrence API",
      countryFilter: "KR",
      basisOfRecord: "HUMAN_OBSERVATION",
      facetLimitPerGroup: FACET_LIMIT,
      minOccurrenceCount: MIN_OCCURRENCE_COUNT,
    },
    totalCount: universe.length,
    byGroup: Object.fromEntries(
      GROUPS.map((g) => [g.app, universe.filter((u) => u.group === g.app).length]),
    ),
    species: universe,
  };

  console.log(JSON.stringify(output, null, 2));
  console.error(`\n총 ${universe.length}종 채택, ${rejected.length}종 제외됨`);
  console.error(`rejected 샘플(최대 10개): ${JSON.stringify(rejected.slice(0, 10), null, 2)}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
