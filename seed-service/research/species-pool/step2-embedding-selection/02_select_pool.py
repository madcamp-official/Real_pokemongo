# -*- coding: utf-8 -*-
"""
2단계 2/2: BioCLIP 임베딩 + GBIF 기반 가중치로 "가중 facility location" 그리디 대표종 선택.

방법론(사용자에게 이미 설명한 알고리즘 그대로):
  - 각 종 = 임베딩 공간(1024차원, L2정규화)의 점. 거리 = 1 - 코사인유사도.
  - 가중치 w_i = 1단계에서 계산한 percentileInSource(그룹 내부 백분위, 0~1).
    그룹 간 관측량 스케일 차이를 이미 정규화해둔 값이라 그대로 재사용.
  - must-include(옻나무/광대버섯/유혈목이/말벌)는 항상 시드로 먼저 포함.
  - 목적함수(가중 facility location, submodular): 현재 선택된 대표집합 S에 대해
        coverage(S) = sum_i w_i * (1 - d(i, nearest(i,S)))
    그리디로 매 스텝 "한계 이득이 가장 큰 종"을 추가한다. Nemhauser et al.(1978) 결과로
    (1-1/e) 근사 보장.
  - k(최종 pool 크기)를 하나로 못 박지 않고, 여러 체크포인트(50/100/150/200/300/500)에서
    스냅샷을 남겨 커버리지 증가 곡선을 같이 보여준다 -- 사용자가 예산 대비 커버리지를 보고
    최종 k를 고를 수 있게.
"""
import json

import numpy as np

with open("/root/livingdex_step2/universe.json", encoding="utf-8") as f:
    universe = json.load(f)
species = universe["species"]

with open("/root/livingdex_step2/embeddings_index.json", encoding="utf-8") as f:
    idx = json.load(f)
embeddings = np.load("/root/livingdex_step2/embeddings.npy")  # (N, D), L2-normalized

assert idx["sciNames"] == [s["sciName"] for s in species], "임베딩 순서와 universe 순서 불일치"
N = len(species)
print(f"총 {N}종, 임베딩 차원 {embeddings.shape[1]}")

weights = np.array([s.get("percentileInSource", 0.5) for s in species], dtype=np.float64)
must_include_idx = [i for i, s in enumerate(species) if s.get("mustInclude")]
print(f"must-include {len(must_include_idx)}종: {[species[i]['sciName'] for i in must_include_idx]}")

# 코사인 유사도 행렬 (N,N) -- L2정규화된 벡터라 내적 = 코사인유사도.
sim = embeddings @ embeddings.T
np.clip(sim, -1.0, 1.0, out=sim)
dist = 1.0 - sim  # (N,N), 대각선은 0

CHECKPOINTS = [50, 100, 150, 200, 300, 500, 750, 999]
MAX_K = max(CHECKPOINTS)

selected = list(must_include_idx)
selected_mask = np.zeros(N, dtype=bool)
selected_mask[selected] = True

# d_i = 현재 S에서 i까지의 최소 거리(= i를 "대표하는" 가장 가까운 선택 종까지 거리).
if selected:
    d = dist[:, selected].min(axis=1)
else:
    d = np.full(N, 1.0)  # 아직 아무도 없으면 전부 거리 1(완전 무관)로 시작

history = []  # (k, coverage, added_sciName)
coverage = float((weights * (1.0 - d)).sum())
history.append({"k": len(selected), "coverage": coverage, "added": None})

checkpoint_set = set(CHECKPOINTS)
snapshots = {}

while len(selected) < MAX_K:
    # 후보 c 하나를 추가했을 때의 한계이득: sum_i w_i * max(0, d_i - dist(i,c))
    # (N,N) 행렬 연산으로 한 번에 계산(그리디 스텝마다 O(N^2), 전체 O(k*N^2) -- N=999,
    # k=999 기준 약 10억 연산, numpy 벡터화면 수십 초~수 분 내 완료).
    gain_matrix = np.maximum(0.0, d[:, None] - dist)  # (N_i, N_c)
    weighted_gain = (weights[:, None] * gain_matrix).sum(axis=0)  # (N_c,)
    weighted_gain[selected_mask] = -1.0  # 이미 뽑힌 건 후보에서 제외

    best_c = int(np.argmax(weighted_gain))
    best_gain = float(weighted_gain[best_c])
    if best_gain <= 0:
        print(f"더 이상 커버리지 개선이 없어 조기 종료 (k={len(selected)})")
        break

    selected.append(best_c)
    selected_mask[best_c] = True
    d = np.minimum(d, dist[:, best_c])
    coverage = float((weights * (1.0 - d)).sum())
    history.append({"k": len(selected), "coverage": coverage, "added": species[best_c]["sciName"]})

    if len(selected) in checkpoint_set:
        snapshots[len(selected)] = {
            "k": len(selected),
            "coverage": coverage,
            "coverage_ratio": coverage / float(weights.sum()),
            "selected": [
                {
                    "sciName": species[i]["sciName"],
                    "group": species[i]["group"],
                    "koreaObservationCount": species[i]["koreaObservationCount"],
                    "percentileInSource": species[i]["percentileInSource"],
                    "mustInclude": bool(species[i].get("mustInclude", False)),
                }
                for i in selected
            ],
        }
        print(f"[체크포인트] k={len(selected)}, coverage_ratio={coverage/float(weights.sum()):.4f}")

# 각 종이 최종적으로 "누구의 대표를 받는지"(가장 가까운 선택종) 기록 -- 해석/검증용.
final_nearest = dist[:, selected].argmin(axis=1)
assignment = [
    {
        "sciName": species[i]["sciName"],
        "group": species[i]["group"],
        "representedBy": species[selected[final_nearest[i]]]["sciName"],
        "distanceToRepresentative": float(dist[i, selected[final_nearest[i]]]),
    }
    for i in range(N)
]

output = {
    "methodology": "weighted facility-location greedy (Nemhauser et al. submodular greedy, (1-1/e) approx)",
    "embedModel": idx["model_str"],
    "totalUniverse": N,
    "mustIncludeCount": len(must_include_idx),
    "checkpoints": sorted(snapshots.keys()),
    "snapshots": snapshots,
    "coverageHistory": history,
    "finalAssignment": assignment,
}
with open("/root/livingdex_step2/pool_selection_result.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print("\n저장 완료: pool_selection_result.json")
print(f"체크포인트: {sorted(snapshots.keys())}")
