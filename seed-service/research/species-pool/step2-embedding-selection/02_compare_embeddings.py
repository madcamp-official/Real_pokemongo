# -*- coding: utf-8 -*-
"""
구버전(CPU, 프롬프트 템플릿 4개 축소) 임베딩과 신규(GPU, 공식 80개 템플릿 전체) 임베딩을
종별로 직접 비교한다. 목적: CPU 축소판이 실제로 얼마나 근사였는지 정량화하고, 이 차이가
facility-location 선택 결과를 바꿀 만큼 큰지 판단할 근거를 남긴다.
"""
import json
import numpy as np

with open("/root/livingdex_step2/embeddings_index.json", encoding="utf-8") as f:
    old_index = json.load(f)
with open("/root/livingdex_step2/embeddings_full80_gpu_index.json", encoding="utf-8") as f:
    new_index = json.load(f)

assert old_index["sciNames"] == new_index["sciNames"], "종 순서가 다름 -- 직접 비교 불가"

old_emb = np.load("/root/livingdex_step2/embeddings.npy")
new_emb = np.load("/root/livingdex_step2/embeddings_full80_gpu.npy")
sci_names = old_index["sciNames"]

# 종별 자기 자신끼리(구 vs 신)의 코사인 유사도 -- 1.0에 가까울수록 "거의 같은 임베딩",
# 낮을수록 템플릿 축소로 인한 편차가 컸다는 뜻.
self_sim = (old_emb * new_emb).sum(axis=1)  # 이미 L2정규화 되어있으므로 내적=코사인유사도

print("=== 구(CPU,4템플릿) vs 신(GPU,80템플릿) 종별 자기-유사도 분포 ===")
pct = np.percentile(self_sim, [0, 1, 5, 10, 25, 50, 75, 90, 95, 99, 100])
labels = ["min", "p1", "p5", "p10", "p25", "median", "p75", "p90", "p95", "p99", "max"]
for l, v in zip(labels, pct):
    print(f"  {l}: {v:.4f}")
print(f"  평균: {self_sim.mean():.4f}")

worst_order = np.argsort(self_sim)[:15]
print("\n=== 구/신 임베딩이 가장 많이 달라진 종 15개 ===")
for i in worst_order:
    print(f"  {sci_names[i]}: self_sim={self_sim[i]:.4f}")

# 상대적 기하구조(랭킹) 보존 여부 확인: 임의 앵커 종 몇 개에 대해 "가장 가까운 이웃 10종"이
# 구/신 임베딩에서 얼마나 겹치는지 확인 -- facility-location은 절대값이 아니라 상대적 거리
# 순서에 의존하므로, 이게 실제로 선택 결과에 영향을 주는지의 핵심 지표.
old_sim_mat = old_emb @ old_emb.T
new_sim_mat = new_emb @ new_emb.T
np.fill_diagonal(old_sim_mat, -1)
np.fill_diagonal(new_sim_mat, -1)

rng = np.random.default_rng(42)
anchor_idx = rng.choice(len(sci_names), size=30, replace=False)
overlaps = []
for i in anchor_idx:
    old_top10 = set(np.argsort(-old_sim_mat[i])[:10])
    new_top10 = set(np.argsort(-new_sim_mat[i])[:10])
    overlaps.append(len(old_top10 & new_top10))

print(f"\n=== 무작위 앵커 30종 기준, '가장 가까운 이웃 10개' 겹침 개수(10이 완전일치) ===")
print(f"  평균 겹침: {np.mean(overlaps):.2f} / 10")
print(f"  분포: min={min(overlaps)}, median={np.median(overlaps):.1f}, max={max(overlaps)}")

result = {
    "selfSimilarity": {
        "mean": float(self_sim.mean()),
        "percentiles": {l: float(v) for l, v in zip(labels, pct)},
    },
    "worstChanged": [{"sciName": sci_names[i], "selfSim": float(self_sim[i])} for i in worst_order],
    "neighborOverlapTop10": {
        "meanOverlapOf10": float(np.mean(overlaps)),
        "sampleSize": len(anchor_idx),
    },
}
with open("/root/livingdex_step2/embedding_comparison_cpu4_vs_gpu80.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("\n저장 완료: embedding_comparison_cpu4_vs_gpu80.json")
