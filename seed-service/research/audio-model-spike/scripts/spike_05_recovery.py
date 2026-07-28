"""Check whether a session survives after a concurrent-call assertion failure."""
import threading
import time
from pathlib import Path

import birdnet

SEG = Path("/root/audio_spike/test_clips/segments")

model = birdnet.load("acoustic", "2.4", "pb", lang="ko")

with model.predict_session(top_k=5, device="GPU:0", n_workers=1, n_producers=1, show_stats=None) as session:
    print("=== 1) 정상 단일 호출 (장애 발생 전 베이스라인) ===")
    r = session.run([str(SEG / "hypsipetes_3s.wav")])
    print("  성공, n_seg=", r.species_probs[0].shape[0])

    print("\n=== 2) 의도적으로 동시 호출 2개로 내부 assertion 유발 ===")
    errors = {}
    def worker(idx, fpath):
        try:
            session.run([fpath])
        except Exception as e:
            errors[idx] = repr(e)
    threads = [
        threading.Thread(target=worker, args=(0, str(SEG / "hypsipetes_3s.wav"))),
        threading.Thread(target=worker, args=(1, str(SEG / "passer_3s.wav"))),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    print("  동시 호출 결과 에러:", errors)

    print("\n=== 3) 장애 이후 같은 세션으로 다시 단일 호출 (복구 여부 확인) ===")
    try:
        r2 = session.run([str(SEG / "hypsipetes_3s.wav")])
        print("  성공 — 세션이 자체 복구됨. n_seg=", r2.species_probs[0].shape[0])
    except Exception as e:
        print("  실패 — 세션이 손상된 채로 남음:", repr(e))

print("\nDONE")
