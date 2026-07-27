# -*- coding: utf-8 -*-
"""
가중 facility-location(합/평균 목적함수)은 평균 커버리지는 잘 올리지만, "이 종은
아무리 늘려도 가까운 대표가 안 생기는" 고립된 종을 놓칠 수 있다(실측: k=100~300 전
구간에서 염소/검독수리/특정 나방류가 계속 dist>=0.5로 남음 -- worst_case_check.py 결과).

이건 정확히 원래 설계 목표의 "조건 1"(비슷한 종 없이 완전히 엉뚱한 것으로 오분류되는
사고 방지)에 대한 위험이므로, greedy 결과에 안전장치를 하나 더 얹는다:
  - k=200(추천 기본값) 선택 결과에서, 대표까지의 거리가 ISOLATION_THRESHOLD를 넘고
    동시에 흔함 가중치(percentileInSource)가 무시할 수준이 아닌(그룹 내 완전 바닥이
    아닌) 종을 찾아 강제로 pool에 추가한다.
  - "완전히 희귀한 종까지 전부 구제"하는 게 아니라 "그럭저럭 관측되는데 임베딩 공간에서만
    고립된 종"만 건진다 -- 그래서 가중치 하한도 같이 건다.
"""
import json
import numpy as np

with open("/root/livingdex_step2/universe.json", encoding="utf-8") as f:
    universe = json.load(f)
species = universe["species"]
sci_to_idx = {s["sciName"]: i for i, s in enumerate(species)}

with open("/root/livingdex_step2/pool_selection_result.json", encoding="utf-8") as f:
    result = json.load(f)

embeddings = np.load("/root/livingdex_step2/embeddings.npy")
sim = embeddings @ embeddings.T
np.clip(sim, -1.0, 1.0, out=sim)
dist = 1.0 - sim

ISOLATION_THRESHOLD = 0.52  # GPU+80템플릿 재계산 후 재보정: k=200 분포에서 p99=0.5256 (구버전과 동일하게 상위~1%/ 진짜 이상치만 잡도록 재조정, 05_check_distance_distribution.py 재실행 결과 근거)
# 최초 0.45로 시도했더니 k=200 기준 11.5%(115종)나 걸려서 재검토함(05_check_distance_
# distribution.py) -- 0.45는 "전형적인 거리"의 89번째 백분위 정도라 "고립"이 아니라 그냥
# "평범히 못 미치는 수준"까지 다 잡고 있었다. 0.50은 같은 분포의 상위 1.6%(p98 부근)로,
# 실제 이상치에 훨씬 가깝다.
MIN_WEIGHT = 0.3  # 그룹 내 백분위 하위 30% 미만은 "너무 희귀"로 보고 구제 대상에서 제외

K_BASE = 200
snap = result["snapshots"][str(K_BASE)]
selected_idx = [sci_to_idx[s["sciName"]] for s in snap["selected"]]
selected_set = set(selected_idx)

nearest = dist[:, selected_idx].min(axis=1)
weights = np.array([s.get("percentileInSource", 0.5) for s in species])

rescued = []
for i in range(len(species)):
    if i in selected_set:
        continue
    if nearest[i] > ISOLATION_THRESHOLD and weights[i] >= MIN_WEIGHT:
        rescued.append(i)

print(f"k={K_BASE} 기준 고립종 구제 대상: {len(rescued)}종")
for i in rescued:
    print(f"  {species[i]['sciName']} ({species[i]['group']}, "
          f"count={species[i]['koreaObservationCount']}, weight={weights[i]:.2f}, "
          f"nearest_dist={nearest[i]:.4f})")

final_pool_idx = selected_idx + rescued
final_pool = [
    {
        "sciName": species[i]["sciName"],
        "group": species[i]["group"],
        "koreaObservationCount": species[i]["koreaObservationCount"],
        "percentileInSource": species[i]["percentileInSource"],
        "mustInclude": bool(species[i].get("mustInclude", False)),
        "isolationRescue": i in rescued,
    }
    for i in final_pool_idx
]

by_group = {}
for s in final_pool:
    by_group[s["group"]] = by_group.get(s["group"], 0) + 1

output = {
    "baseK": K_BASE,
    "isolationThreshold": ISOLATION_THRESHOLD,
    "minWeightForRescue": MIN_WEIGHT,
    "rescuedCount": len(rescued),
    "finalPoolSize": len(final_pool),
    "byGroup": by_group,
    "pool": final_pool,
}
with open("/root/livingdex_step2/final_pool_k200_with_safety_net.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"\n최종 pool 크기: {len(final_pool)}종 (greedy {len(selected_idx)} + 구제 {len(rescued)})")
print("byGroup:", by_group)
