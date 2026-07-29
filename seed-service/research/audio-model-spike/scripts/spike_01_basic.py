"""BirdNET Stage-1 spike: model load, license/version, predict/encode, M4A support."""
import json
import time
from pathlib import Path

import birdnet

CLIPS = Path("/root/audio_spike/test_clips")
SEG = CLIPS / "segments"

print("=== 1) 모델 로드 (backend=pb, GPU) ===")
t0 = time.perf_counter()
model = birdnet.load("acoustic", "2.4", "pb", lang="ko")
t1 = time.perf_counter()
print(f"load time: {t1 - t0:.2f}s")
print(f"version: {model.get_version()}")
print(f"n_species: {model.n_species}")
print(f"sample_rate: {model.get_sample_rate()}")
print(f"segment_size_s: {model.get_segment_size_s()}")
print(f"fmin/fmax: {model.get_sig_fmin()} / {model.get_sig_fmax()}")

print("\n=== 2) species_list 일부 (한글 라벨 확인) ===")
sp_list = list(model.species_list)
print(f"total species in list: {len(sp_list)}")
matches = [s for s in sp_list if "Hypsipetes amaurotis" in s or "Passer montanus" in s or "Pica" in s]
for m in matches:
    print(" ", m)

print("\n=== 3) predict() on WAV (GPU, n_workers=1) — hypsipetes 15s ===")
t0 = time.perf_counter()
result = model.predict(
    str(SEG / "hypsipetes_15s.wav"), device="GPU:0", top_k=5, n_workers=1, n_producers=1
)
t1 = time.perf_counter()
print(f"predict time: {t1 - t0:.3f}s")
print(type(result))
print(dir(result))
try:
    print("as dict/json-ish:", result.__dict__ if hasattr(result, "__dict__") else result)
except Exception as e:
    print("dump failed:", repr(e))

print("\n=== 4) encode() on same file (GPU, n_workers=1) ===")
try:
    t0 = time.perf_counter()
    enc = model.encode(
        str(SEG / "hypsipetes_15s.wav"), device="GPU:0", n_workers=1, n_producers=1
    )
    t1 = time.perf_counter()
    print(f"encode time: {t1 - t0:.3f}s")
    print(type(enc))
    print(dir(enc))
except Exception as e:
    print("encode failed:", repr(e))

print("\n=== 5) M4A 입력 지원 여부 (CPU, n_workers=1) ===")
try:
    r = model.predict(str(SEG / "hypsipetes_test.m4a"), device="CPU", top_k=3, n_workers=1, n_producers=1)
    print("M4A predict succeeded:", r)
except Exception as e:
    print("M4A predict FAILED as expected:", repr(e))

print("\nDONE")
