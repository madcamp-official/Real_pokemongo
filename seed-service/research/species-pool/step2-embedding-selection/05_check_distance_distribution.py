# -*- coding: utf-8 -*-
"""0.45라는 고립 임계값이 실제로 '이상치'를 잡아내는 값인지, 아니면 이 임베딩 공간에서
그냥 흔한 거리인지 분포 자체를 확인한다 -- 상위 10개만 보고 임계값을 정한 게 성급했을 수 있음."""
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

for k in [100, 150, 200, 300]:
    snap = result["snapshots"][str(k)]
    selected_idx = [sci_to_idx[s["sciName"]] for s in snap["selected"]]
    nearest = dist[:, selected_idx].min(axis=1)
    pct = np.percentile(nearest, [10, 25, 50, 75, 90, 95, 99, 100])
    print(f"k={k}: min={nearest.min():.4f} p10={pct[0]:.4f} p25={pct[1]:.4f} median={pct[2]:.4f} "
          f"p75={pct[3]:.4f} p90={pct[4]:.4f} p95={pct[5]:.4f} p99={pct[6]:.4f} max={pct[7]:.4f}")
    print(f"  0.45 초과 비율: {(nearest>0.45).mean()*100:.1f}%  0.5 초과 비율: {(nearest>0.5).mean()*100:.1f}%")

# 전체 유니버스(자기 자신 제외) pairwise 최소거리 분포도 참고 -- "임의의 두 종"이 보통
# 얼마나 떨어져 있는지의 기준선.
np.fill_diagonal(dist, np.inf)
nn_all = dist.min(axis=1)
pct_all = np.percentile(nn_all, [10, 25, 50, 75, 90, 95, 99, 100])
print(f"\n[기준선] 전체 1000종 중 '가장 가까운 이웃 1개'까지의 거리 분포:")
print(f"  min={nn_all.min():.4f} p10={pct_all[0]:.4f} p25={pct_all[1]:.4f} median={pct_all[2]:.4f} "
      f"p75={pct_all[3]:.4f} p90={pct_all[4]:.4f} p95={pct_all[5]:.4f} max={pct_all[7]:.4f}")
