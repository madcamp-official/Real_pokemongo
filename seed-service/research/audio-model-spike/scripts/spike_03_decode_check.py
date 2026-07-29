"""Verify species_probs ordering (ascending vs descending) and correct top-1 decode."""
from pathlib import Path
import birdnet

SEG = Path("/root/audio_spike/test_clips/segments")

model = birdnet.load("acoustic", "2.4", "pb", lang="ko")

with model.predict_session(top_k=5, device="GPU:0", n_workers=1, n_producers=1, show_stats=None) as session:
    for name, fname in [("직박구리", "hypsipetes_15s.wav"), ("참새", "passer_15s.wav"), ("까치", "pica_15s.wav")]:
        r = session.run([str(SEG / fname)])
        probs = r.species_probs[0]
        ids = r.species_ids[0]
        sp_list = r.species_list
        print(f"\n--- {name} ({fname}) ---")
        for seg_i in range(probs.shape[0]):
            row_probs = probs[seg_i]
            row_ids = ids[seg_i]
            # print raw row to see ordering
            pairs = [(sp_list[int(row_ids[k])], float(row_probs[k])) for k in range(len(row_ids))]
            print(f" seg{seg_i}: {pairs}")
