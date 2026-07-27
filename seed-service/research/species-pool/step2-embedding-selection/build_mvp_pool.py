# -*- coding: utf-8 -*-
"""
MVP 축소판 species pool 생성.

배경: 2단계(임베딩+facility-location)로 뽑은 213종 pool은 "비슷한 대표종이 최소 1개는
있어야 한다"는 조건(coverage)에 너무 집착해서, 균류/어류/포유류/양서류/파충류에서
실제로는 안 흔한 종들이 다수 편입됐다. 도감 사진·설명·3D 모델링이라는 실제 제작
비용이 있는 지금 시점에서는 coverage 최적화보다 "생산 가능한 범위에서 확실히 흔한
종 위주로 시작"하는 게 맞다는 판단 하에, 이번엔 facility-location을 아예 쓰지 않고
1단계 산출물(1000종 유니버스)의 percentileInSource(그룹별 흔함 순위)만으로 곤충/
식물/조류 3개 그룹만 순수 랭킹 컷오프한다.

균류/어류(무척추동물 포함 'other')/포유류/양서류/파충류는 그룹 자체를 비우되,
스키마에서 완전히 삭제하지 않고 "byGroup 0"으로 남겨 추후 채워 넣을 자리를 유지한다.
단, 안전 필수 상징종 2개(광대버섯-균류, 유혈목이-파충류)는 그룹 방침과 무관하게
사용자 승인 하에 예외로 강제 포함한다.
"""
import json

SRC = "../kr-species-universe-v3-final.json"
OUT = "mvp_pool_v1.json"

with open(SRC, encoding="utf-8") as f:
    universe = json.load(f)
all_species = universe["species"]
by_sci = {s["sciName"]: s for s in all_species}

FOCUS_GROUPS = ["insect", "plant", "bird"]
EMPTY_GROUPS = ["fungus", "other", "mammal", "amphibian", "reptile"]
PCT_THRESHOLD = 0.9

SAFETY_EXCEPTIONS = ["Amanita muscaria", "Rhabdophis tigrinus"]  # 균류/파충류 그룹은 비우되 예외 유지

# 관측건수는 높지만 "주변에서 흔히 마주치는" 종은 아닌 경우(예: 겨울철 특정 지역 급식장에
# 집중 관측되는 종) 수동 제외. GBIF 관측량은 탐조 활동 집중도의 영향을 받아 "진짜 어디서나
# 흔함"과 "특정 장소/시기에 몰려서 많이 기록됨"을 구분하지 못하는 한계가 있어, 이런 케이스는
# 알고리즘이 못 잡아내므로 직접 확인해 제외한다. 제외되면 바로 다음 순위 종으로 자동 보충된다.
MANUAL_EXCLUSIONS = {
    "Aegypius monachus": "관측건수는 높지만(bird 10위) 겨울철 철원 등 특정 급식장에 몰려 "
                          "관측되는 종 — '주변에서 흔히 마주침'과는 거리가 있어 제외, 다음 "
                          "순위 종으로 자동 보충",
    # 82종 표(82_species_table.xlsx) 작성 중 국명 중복 발견 -> GBIF 종별 vernacularNames에서
    # Catalogue of Life가 등록한 한국어 국명 유무로 교차검증(Step1의 Pica pica 오염 발견과
    # 동일한 패턴/방법론). 각 쌍에서 한국어 국명이 등록된 species_key만 남기고 반대쪽은 제외.
    "Parus major": "'박새' 중복 — GBIF vernacularNames 조회 결과 한국어 국명이 Parus cinereus "
                   "쪽에만 등록됨(Catalogue of Life). Parus major는 유럽/서부 고북구 중심종이라 "
                   "제외, Parus cinereus만 유지",
    "Anas poecilorhyncha": "'흰뺨검둥오리' 중복 — 한국어 국명이 Anas zonorhyncha 쪽에만 등록됨"
                           "(Catalogue of Life). Anas poecilorhyncha(Indian Spot-billed Duck)는 "
                           "남아시아 중심종이라 제외, Anas zonorhyncha만 유지",
}

final_pool = []
by_group_count = {}

for g in FOCUS_GROUPS:
    sub = [s for s in all_species if s["group"] == g]
    sub.sort(key=lambda s: -s.get("percentileInSource", 0))

    # 목표 종수는 제외 전 컷오프 기준으로 정하고, 수동 제외된 종은 순위상 바로 다음
    # 종으로 자동 보충한다(목표 개수 자체는 컷오프 정책을 그대로 따르도록 유지).
    target_n = sum(1 for s in sub if s.get("percentileInSource", 0) >= PCT_THRESHOLD)
    sub = [s for s in sub if s["sciName"] not in MANUAL_EXCLUSIONS]
    selected = sub[:target_n]
    selected_names = {s["sciName"] for s in selected}

    # 이 그룹 소속 mustInclude 종은 컷오프 미달이어도 강제 포함(안전/상징종 원래 취지 유지).
    must_in_group = [s for s in sub if s.get("mustInclude") and s["sciName"] not in selected_names]
    for s in must_in_group:
        selected.append(s)

    for s in selected:
        final_pool.append({
            "sciName": s["sciName"],
            "group": s["group"],
            "koreaObservationCount": s["koreaObservationCount"],
            "percentileInSource": s.get("percentileInSource"),
            "mustInclude": bool(s.get("mustInclude", False)),
            "mustIncludeReason": s.get("mustIncludeReason"),
            "selectionMethod": "mvp_pure_commonness_rank",
        })
    by_group_count[g] = len(selected)

# 그룹 자체를 비우는 5개 그룹: 안전 예외 2종만 강제 포함.
for sci in SAFETY_EXCEPTIONS:
    s = by_sci[sci]
    final_pool.append({
        "sciName": s["sciName"],
        "group": s["group"],
        "koreaObservationCount": s["koreaObservationCount"],
        "percentileInSource": s.get("percentileInSource"),
        "mustInclude": True,
        "mustIncludeReason": s.get("mustIncludeReason"),
        "selectionMethod": "safety_exception_despite_empty_group",
    })
    by_group_count[s["group"]] = by_group_count.get(s["group"], 0) + 1

for g in EMPTY_GROUPS:
    by_group_count.setdefault(g, 0)

# 중복/누락 검증
names = [s["sciName"] for s in final_pool]
assert len(names) == len(set(names)), "중복 종 발견"
for sci in SAFETY_EXCEPTIONS:
    assert sci in names, f"{sci} 누락"
for sci in ["Vespa mandarinia", "Toxicodendron vernicifluum"]:
    assert sci in names, f"{sci} (그룹 내 mustInclude) 누락"
for sci in MANUAL_EXCLUSIONS:
    assert sci not in names, f"{sci}가 수동 제외 목록인데도 포함돼 있음"

output = {
    "methodology": (
        "MVP v1: facility-location(coverage) 미사용. 곤충/식물/조류 3개 그룹만 "
        f"percentileInSource>={PCT_THRESHOLD} 순수 흔함 랭킹 컷오프 + 그룹 내 mustInclude 강제 포함. "
        "균류/어류(무척추동물 포함)/포유류/양서류/파충류는 그룹 스키마만 유지한 채 비움 "
        "(단, 광대버섯/유혈목이 2종은 안전상 예외로 강제 포함). "
        "관측건수는 높지만 특정 장소/시기에 집중 관측되는 종은 수동 제외 후 다음 순위로 보충."
    ),
    "pctThreshold": PCT_THRESHOLD,
    "focusGroups": FOCUS_GROUPS,
    "emptyGroups": EMPTY_GROUPS,
    "safetyExceptions": SAFETY_EXCEPTIONS,
    "manualExclusions": MANUAL_EXCLUSIONS,
    "finalPoolSize": len(final_pool),
    "byGroup": by_group_count,
    "pool": final_pool,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"최종 MVP pool: {len(final_pool)}종")
print("byGroup:", by_group_count)
print(f"저장 완료: {OUT}")
