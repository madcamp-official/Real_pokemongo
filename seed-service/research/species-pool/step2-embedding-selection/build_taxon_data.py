# -*- coding: utf-8 -*-
"""
Phase 1: mvp_pool_v1.json(82종, sciName/group/koreaObservationCount만 있음)에
xlsx의 국명을 결합하고, DB 스키마(taxon 테이블)가 요구하는 나머지 필수 필드를
채워 Taxon 형태로 완성한다.

방침(사용자 지시 + 기존 프로덕션 선례 기반, 임의 추정 배제):
- taxonId: 기존 프로덕션 7종(옻나무·배추흰나비·무당벌레·양봉꿀벌·닭의장풀·서양민들레·
  광대버섯)은 seedData.ts에 이미 있는 taxonId를 그대로 재사용(퀘스트/DB FK 호환성).
  나머지 75종은 학명 기반 결정적 슬러그(taxon-<genus>-<species>)를 새로 발급.
- korName: xlsx 값을 그대로 채택(기존 '민들레'->'서양민들레', '꿀벌'->'양봉꿀벌 (서양종꿀벌)'
  로 갱신되는 부작용 있음 -- 사용자가 xlsx를 근거로 지정했으므로 그대로 반영).
- riskTags: 사용자가 지정한 4종만(양봉꿀벌/장수말벌->sting_or_bite, 광대버섯->
  toxic_if_eaten, 유혈목이->sting_or_bite[기존 enum 중 물림 위험에 가장 가까운 값]).
  나머지는 전부 빈 배열 -- 옻나무의 기존 contact_dermatitis 태그도 이번엔 제거됨(명시).
- rarity: DB에서 NOT NULL 필수 필드. 기존 프로덕션 선례(옻나무 count=228->uncommon,
  광대버섯 count=5->uncommon, 나머지 6종 count>=3000대->common)와 정확히 일치하는
  규칙인 "koreaObservationCount < 1000 -> uncommon, 그 외 -> common"을 그대로 적용.
  생태 지식을 새로 지어내지 않고 이미 있는 관측량 데이터에서만 도출.
- rank: 전부 "species"(유니버스 데이터 자체가 종 단위).
- seasonTags/habitatTags/aliases: 이번 라운드에 채우지 않음(검증 안 된 생태 정보를
  지어내지 않기 위함). 기존 7종은 seedData.ts에 이미 있는 값을 그대로 보존.
"""
import json
import re

import openpyxl

XLSX = "82_species_table.xlsx"
POOL = "mvp_pool_v1.json"
OUT = "taxon_data_v1.json"

# 기존 프로덕션(seedData.ts) 7종 -- taxonId/seasonTags/habitatTags/aliases 보존 대상.
EXISTING = {
    "Taraxacum officinale": {
        "id": "taxon-dandelion", "seasonTags": ["spring"],
        "habitatTags": ["neighborhood", "park", "field"], "aliases": ["yellow", "노란꽃"],
    },
    "Commelina communis": {
        "id": "taxon-dayflower", "seasonTags": ["summer"],
        "habitatTags": ["field", "waterside"], "aliases": ["blue"],
    },
    "Pieris rapae": {
        "id": "taxon-cabbage-white", "seasonTags": ["spring", "summer"],
        "habitatTags": ["field", "garden", "park"], "aliases": ["wing", "날개"],
    },
    "Harmonia axyridis": {
        "id": "taxon-ladybug", "seasonTags": ["spring", "summer", "autumn"],
        "habitatTags": ["garden", "field", "neighborhood"], "aliases": ["wing", "날개"],
    },
    "Apis mellifera": {
        "id": "taxon-honeybee", "seasonTags": ["spring", "summer"],
        "habitatTags": ["garden", "park", "field"], "aliases": ["wing", "날개"],
    },
    "Toxicodendron vernicifluum": {
        "id": "taxon-lacquer-tree", "seasonTags": ["summer", "autumn"],
        "habitatTags": ["mountain"], "aliases": [],
    },
    "Amanita muscaria": {
        "id": "taxon-fly-agaric", "seasonTags": ["autumn"],
        "habitatTags": ["mountain"], "aliases": [],
    },
}

RISK_TAGS = {
    "Apis mellifera": ["sting_or_bite"],                 # 양봉꿀벌
    "Vespa mandarinia": ["sting_or_bite"],                # 장수말벌
    "Amanita muscaria": ["toxic_if_eaten"],               # 광대버섯
    "Rhabdophis tigrinus": ["sting_or_bite"],             # 유혈목이(독사 물림 위험 -- 기존 enum 중 최근접)
    "Toxicodendron vernicifluum": ["contact_dermatitis"], # 옻나무(기존 프로덕션 태그 유지)
}


def slugify(sci_name: str) -> str:
    s = sci_name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return f"taxon-{s}"


# --- xlsx 국명 로드 ---
# 주의: xlsx는 mvp_pool_v1.json의 이전 버전(중복 국명 오염 수정 전) 기준으로 작성됐다.
# 검증 과정에서 '박새'(Parus major/cinereus 중복), '흰뺨검둥오리'(Anas poecilorhyncha/
# zonorhyncha 중복)를 발견 -- GBIF vernacularNames의 Catalogue of Life 한국어 국명 등록
# 여부로 교차검증한 결과 Parus major/Anas poecilorhyncha가 오염(한국 서식 아님)으로 판명돼
# 제외하고 다음 순위 종(Phalacrocorax carbo/Cyanopica cyanus)으로 보충했다(Step1의
# Pica pica 오염 발견과 동일 방법론, build_mvp_pool.py의 MANUAL_EXCLUSIONS 참고).
# 보충된 2종은 xlsx에 없어 별도 조회한 국명을 KOR_MAP_EXTRA로 추가한다.
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["213_species"]
rows = list(ws.iter_rows(values_only=True))[1:]
kor_map = {r[0]: r[1] for r in rows}
assert all(v for v in kor_map.values()), "xlsx에 빈 국명 존재"
assert len(kor_map) == len(set(kor_map)), "xlsx 학명 중복"

# xlsx 이후 오염 수정으로 빠진 2종은 제거, 보충된 2종은 추가.
for removed in ["Parus major", "Anas poecilorhyncha"]:
    kor_map.pop(removed, None)

KOR_MAP_EXTRA = {
    # GBIF vernacularNames, Catalogue of Life 출처(위 오염 검증과 같은 방식으로 조회).
    "Cyanopica cyanus": "물까치",
    # GBIF/CoL에 이 학명 자체의 한국어 국명이 등록돼 있지 않아(하위종 P. c. sinensis도 없음),
    # 한국 조류 문헌에서 통용되는 표준 국명을 사용 -- 출처가 다른 80종과 다름을 명시.
    "Phalacrocorax carbo": "민물가마우지",
}
kor_map.update(KOR_MAP_EXTRA)

# --- pool 로드 ---
with open(POOL, encoding="utf-8") as f:
    pool = json.load(f)["pool"]

assert set(s["sciName"] for s in pool) == set(kor_map), "pool과 국명 매핑 학명 집합 불일치"

used_ids = set()
taxa = []
for s in pool:
    sci = s["sciName"]
    kor = kor_map[sci]
    existing = EXISTING.get(sci)
    taxon_id = existing["id"] if existing else slugify(sci)
    assert taxon_id not in used_ids, f"taxonId 충돌: {taxon_id}"
    used_ids.add(taxon_id)

    rarity = "uncommon" if s["koreaObservationCount"] < 1000 else "common"

    taxa.append({
        "id": taxon_id,
        "sciName": sci,
        "korName": kor,
        "korNameSource": "82_species_table.xlsx" if sci not in KOR_MAP_EXTRA else (
            "GBIF vernacularNames(Catalogue of Life)" if sci == "Cyanopica cyanus"
            else "한국 조류 문헌 통용 국명(GBIF/CoL 미등록)"
        ),
        "rank": "species",
        "group": s["group"],
        "rarity": rarity,
        "riskTags": RISK_TAGS.get(sci, []),
        "seasonTags": existing["seasonTags"] if existing else [],
        "habitatTags": existing["habitatTags"] if existing else [],
        "aliases": existing["aliases"] if existing else [],
        "koreaObservationCount": s["koreaObservationCount"],
        "isExistingProduction": bool(existing),
        "needsSeasonHabitatCuration": existing is None,
    })

# --- 검증 ---
assert len(taxa) == 82
ids = [t["id"] for t in taxa]
assert len(ids) == len(set(ids)), "taxonId 중복 발견"
kor_names = [t["korName"] for t in taxa]
assert len(kor_names) == len(set(kor_names)), "국명 중복 발견"

risk_species = {t["sciName"] for t in taxa if t["riskTags"]}
expected_risk = set(RISK_TAGS)
assert risk_species == expected_risk, f"riskTags 적용 불일치: {risk_species} vs {expected_risk}"

for sci, eid in [("Taraxacum officinale", "taxon-dandelion"), ("Apis mellifera", "taxon-honeybee")]:
    t = next(x for x in taxa if x["sciName"] == sci)
    assert t["id"] == eid, f"{sci} 기존 taxonId 불일치"

existing_count = sum(1 for t in taxa if t["isExistingProduction"])
assert existing_count == 7, f"기존 프로덕션 종수 불일치: {existing_count}"

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"generatedAt": "2026-07-27", "totalCount": len(taxa), "taxa": taxa}, f,
              ensure_ascii=False, indent=2)

print(f"완료: {len(taxa)}종, 기존 프로덕션 유지 {existing_count}종, 신규 taxonId {len(taxa)-existing_count}종")
print(f"riskTags 적용 종: {sorted(risk_species)}")
by_rarity = {}
for t in taxa:
    by_rarity[t["rarity"]] = by_rarity.get(t["rarity"], 0) + 1
print("rarity 분포:", by_rarity)
print(f"저장 완료: {OUT}")
