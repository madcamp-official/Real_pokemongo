# -*- coding: utf-8 -*-
"""
Phase 3: 82종 사이의 오동정(혼동) 위험 분석.

원래 알고리즘 설계(세션 최초 대화)의 "조건 2" — 비슷한 종끼리 서로 오분류되는 문제.
BioCLIP는 텍스트-이미지 공유 임베딩 공간을 쓰므로(zero-shot 매칭의 핵심 원리),
학명 텍스트 임베딩끼리의 코사인 유사도가 "실제 사진 분류 시 얼마나 헷갈릴 후보인가"의
합리적 프록시가 된다 -- 이미 82종 전체의 GPU+80템플릿 임베딩이 계산돼 있으므로
(embeddings.npy, 1000종 중 슬라이스) 재계산 없이 바로 분석 가능.

GPU 서버의 open-set 교차검증(HybridClassifier)은 "82종 후보 밖의 세상과 비교해
말이 되는가"를 검증하지, "82종 안에서 서로 닮은 둘 중 어느 쪽인가"는 검증하지
않는다 -- 이 둘은 서로 다른 실패 모드라 서로를 대체하지 않는다.
"""
import json
import numpy as np

with open("embeddings_index.json", encoding="utf-8") as f:
    idx = json.load(f)
sci_names_1000 = idx["sciNames"]
emb1000 = np.load("embeddings.npy")

with open("taxon_data_v1.json", encoding="utf-8") as f:
    taxa = json.load(f)["taxa"]
sci82 = [t["sciName"] for t in taxa]
kor_by_sci = {t["sciName"]: t["korName"] for t in taxa}
group_by_sci = {t["sciName"]: t["group"] for t in taxa}

pos = {s: i for i, s in enumerate(sci_names_1000)}
idx82 = [pos[s] for s in sci82]
emb82 = emb1000[idx82]  # (82, 1024)

# L2 정규화 재확인(이미 정규화돼 있어야 하지만, 슬라이스 후에도 검증).
norms = np.linalg.norm(emb82, axis=1)
assert abs(norms - 1.0).max() < 1e-3, f"L2 정규화 깨짐: max dev={abs(norms-1.0).max()}"

sim = emb82 @ emb82.T
np.fill_diagonal(sim, -1.0)  # 자기 자신 제외

n = len(sci82)
nearest_sim = sim.max(axis=1)
nearest_idx = sim.argmax(axis=1)

print("=== 최근접 이웃 유사도 분포(자기 자신 제외) ===")
pct = np.percentile(nearest_sim, [50, 75, 90, 95, 99, 100])
for label, v in zip(["median", "p75", "p90", "p95", "p99", "max"], pct):
    print(f"  {label}: {v:.4f}")

print("\n=== 유사도 상위 20쌍(중복 제거) ===")
pairs = []
seen = set()
order = np.argsort(-sim.flatten())
flat_n = n * n
for k in order:
    i, j = divmod(int(k), n)
    if i >= j:
        continue
    key = (min(i, j), max(i, j))
    if key in seen:
        continue
    seen.add(key)
    pairs.append((i, j, sim[i, j]))
    if len(pairs) >= 30:
        break

for i, j, s in pairs:
    same_genus = sci82[i].split()[0] == sci82[j].split()[0]
    print(f"  {s:.4f}  {kor_by_sci[sci82[i]]:12s}({sci82[i]:28s}) <-> "
          f"{kor_by_sci[sci82[j]]:12s}({sci82[j]:28s})  "
          f"group={group_by_sci[sci82[i]]}  same_genus={same_genus}")

result = {
    "n": n,
    "nearestSimPercentiles": {l: float(v) for l, v in zip(["p50", "p75", "p90", "p95", "p99", "max"], pct)},
    "topPairs": [
        {
            "sciA": sci82[i], "korA": kor_by_sci[sci82[i]],
            "sciB": sci82[j], "korB": kor_by_sci[sci82[j]],
            "similarity": float(s),
            "sameGenus": sci82[i].split()[0] == sci82[j].split()[0],
            "group": group_by_sci[sci82[i]],
        }
        for i, j, s in pairs
    ],
}
with open("confusion_analysis_raw.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("\n저장 완료: confusion_analysis_raw.json")
