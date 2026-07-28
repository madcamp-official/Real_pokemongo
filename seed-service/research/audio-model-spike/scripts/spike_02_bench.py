"""BirdNET Stage-1 spike part 2: persistent-session latency bench + species mapping + stability."""
import json
import statistics
import time
from pathlib import Path

import birdnet

CLIPS = Path("/root/audio_spike/test_clips")
SEG = CLIPS / "segments"

print("=== 모델 로드 ===")
model = birdnet.load("acoustic", "2.4", "pb", lang="ko")


def decode_top(result, idx=0):
    """result.species_probs shape: (n_files, n_segments, top_k); species_ids same shape."""
    probs = result.species_probs[idx]
    ids = result.species_ids[idx]
    sp_list = result.species_list
    out = []
    for seg_i in range(probs.shape[0]):
        top_id = int(ids[seg_i][0])
        top_prob = float(probs[seg_i][0])
        out.append((sp_list[top_id], top_prob))
    return out


print("\n=== A) 지속 세션(predict_session) 지연 측정: 3/6/10/15초 x 3종 x 5회 반복 ===")
latencies = {}  # duration -> [seconds]
with model.predict_session(
    top_k=5, device="GPU:0", n_workers=1, n_producers=1, show_stats=None
) as session:
    # 워밍업 (첫 호출은 GPU 커널 컴파일 등으로 느릴 수 있음 — 워밍업은 통계에서 제외)
    warm_t0 = time.perf_counter()
    session.run([str(SEG / "hypsipetes_3s.wav")])
    warm_t1 = time.perf_counter()
    print(f"[워밍업] 첫 호출: {warm_t1 - warm_t0:.3f}s (통계 제외)")

    for dur in [3, 6, 10, 15]:
        latencies[dur] = []
        for species in ["hypsipetes", "passer", "pica"]:
            f = SEG / f"{species}_{dur}s.wav"
            for rep in range(5):
                t0 = time.perf_counter()
                result = session.run([str(f)])
                t1 = time.perf_counter()
                latencies[dur].append(t1 - t0)
        top = decode_top(result)
        print(f"  {dur}s 마지막 결과 top segment 예측: {top[0]}")

    print("\n=== B) 동일 파일 반복 추론 안정성 (hypsipetes_15s, 5회) ===")
    stable_results = []
    for rep in range(5):
        r = session.run([str(SEG / "hypsipetes_15s.wav")])
        top = decode_top(r)
        stable_results.append(json.dumps([[s, round(p, 6)] for s, p in top]))
    print("모두 동일한가?", len(set(stable_results)) == 1)
    for s in stable_results:
        print(" ", s)

print("\n=== C) 지연 통계 (초, 세션 재사용 기준) ===")
for dur, vals in latencies.items():
    vals_sorted = sorted(vals)
    mean = statistics.mean(vals)
    p95 = vals_sorted[int(len(vals_sorted) * 0.95) - 1] if len(vals_sorted) >= 5 else max(vals_sorted)
    print(f"  {dur}s 입력: n={len(vals)} mean={mean:.3f}s p95={p95:.3f}s min={min(vals):.3f}s max={max(vals):.3f}s")

print("\nDONE")
