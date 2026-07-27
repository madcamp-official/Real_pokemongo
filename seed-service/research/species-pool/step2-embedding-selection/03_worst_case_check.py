# -*- coding: utf-8 -*-
"""
가중 facility-location(합/평균 목적함수)은 "평균적으로 잘 커버"를 보장하지만, 특정
종 하나가 유난히 안 좋게 대표될 가능성(=min-max/k-center 관점의 최악의 경우)까지
보장하진 않는다. 몇몇 실질적 예산(k=100/150/200/300) 지점에서 "가장 멀리 떨어진
대표를 받은 종"이 무엇인지 확인해서 이 위험이 실제로 있는지 점검한다.
"""
import json
import numpy as np

with open("/root/livingdex_step2/universe.json", encoding="utf-8") as f:
    universe = json.load(f)
species = universe["species"]

with open("/root/livingdex_step2/pool_selection_result.json", encoding="utf-8") as f:
    result = json.load(f)

embeddings = np.load("/root/livingdex_step2/embeddings.npy")
sim = embeddings @ embeddings.T
np.clip(sim, -1.0, 1.0, out=sim)
dist = 1.0 - sim

sci_to_idx = {s["sciName"]: i for i, s in enumerate(species)}

for k in [100, 150, 200, 300]:
    snap = result["snapshots"][str(k)]
    selected_idx = [sci_to_idx[s["sciName"]] for s in snap["selected"]]
    nearest = dist[:, selected_idx].min(axis=1)
    worst_order = np.argsort(-nearest)[:10]
    print(f"\n=== k={k}: 최악으로 대표되는 종 상위 10 ===")
    for i in worst_order:
        rep_local = int(np.argmin(dist[i, selected_idx]))
        rep_sci = species[selected_idx[rep_local]]["sciName"]
        print(f"  {species[i]['sciName']} ({species[i]['group']}, count={species[i]['koreaObservationCount']}) "
              f"-> {rep_sci}, dist={nearest[i]:.4f}")
