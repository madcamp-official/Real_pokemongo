"""BirdNET Stage-1 spike part 3: 18-species mapping, GPU util snapshot, concurrency."""
import json
import subprocess
import threading
import time
from pathlib import Path

import birdnet

MAP_DIR = Path("/root/audio_spike/test_clips/mapping_60s")
SEG = Path("/root/audio_spike/test_clips/segments")

# taxon_id, kor_name, sci_name, filename (stem-matched)
SPECIES = [
    ("taxon-hypsipetes-amaurotis", "직박구리", "Hypsipetes amaurotis", "hypsipetes_XC992555.mp3"),
    ("taxon-passer-montanus", "참새", "Passer montanus", "passer_XC674826.mp3"),
    ("taxon-streptopelia-orientalis", "멧비둘기", "Streptopelia orientalis", "streptopelia_XC266172.wav"),
    ("taxon-ardea-cinerea", "왜가리", "Ardea cinerea", "ardea_cinerea_XC994509.wav"),
    ("taxon-corvus-macrorhynchos", "큰부리까마귀", "Corvus macrorhynchos", "corvus_XC803820.wav"),
    ("taxon-pica-serica", "까치", "Pica serica", "pica_XC581681.mp3"),
    ("taxon-phoenicurus-auroreus", "딱새", "Phoenicurus auroreus", "phoenicurus_XC805198.wav"),
    ("taxon-larus-crassirostris", "괭이갈매기", "Larus crassirostris", "larus_XC840768.wav"),
    ("taxon-anas-platyrhynchos", "청둥오리", "Anas platyrhynchos", "anas_platy_XC495820.wav"),
    ("taxon-ardea-alba", "대백로", "Ardea alba", "ardea_alba_XC558126.wav"),
    ("taxon-sinosuthora-webbiana", "붉은머리오목눈이", "Sinosuthora webbiana", "sinosuthora_XC1107211.wav"),
    ("taxon-parus-cinereus", "박새", "Parus cinereus", "parus_XC889843.wav"),
    ("taxon-poecile-palustris", "쇠박새", "Poecile palustris", "poecile_XC798068.wav"),
    ("taxon-emberiza-elegans", "노랑턱멧새", "Emberiza elegans", "emberiza_XC985900.wav"),
    ("taxon-anas-zonorhyncha", "흰뺨검둥오리", "Anas zonorhyncha", "anas_zono_XC992583.wav"),
    ("taxon-motacilla-alba", "알락할미새", "Motacilla alba", "motacilla_XC648375.wav"),
    ("taxon-phalacrocorax-carbo", "민물가마우지", "Phalacrocorax carbo", "phalacrocorax_XC1152638.wav"),
    ("taxon-cyanopica-cyanus", "물까치", "Cyanopica cyanus", "cyanopica_XC841273.wav"),
]

print("=== 모델 로드 ===")
model = birdnet.load("acoustic", "2.4", "pb", lang="ko")
sp_list = list(model.species_list)
sci_to_label = {}
for label in sp_list:
    sci = label.split("_", 1)[0]
    sci_to_label.setdefault(sci, label)

print("\n=== A) 18종 학명 -> BirdNET 라벨 존재 여부 (species_list 매칭) ===")
for taxon_id, kor, sci, fname in SPECIES:
    present = sci in sci_to_label
    label = sci_to_label.get(sci, "(NOT IN MODEL)")
    print(f"  {kor:10s} {sci:28s} in_model={present}  label={label}")

print("\n=== B) 실제 오디오로 top-1 예측 (세그먼트별 최고 신뢰도, idx=-1이 1위) ===")
with model.predict_session(
    top_k=5, device="GPU:0", n_workers=1, n_producers=1, show_stats=None
) as session:
    for taxon_id, kor, sci, fname in SPECIES:
        f = MAP_DIR / fname
        if not f.exists():
            print(f"  {kor}: 파일 없음 {f}")
            continue
        t0 = time.perf_counter()
        r = session.run([str(f)])
        t1 = time.perf_counter()
        probs = r.species_probs[0]
        ids = r.species_ids[0]
        best_seg, best_prob, best_label, target_seen = None, -1.0, None, False
        target_best_prob = 0.0
        for seg_i in range(probs.shape[0]):
            top_label = sp_list[int(ids[seg_i][-1])]
            top_prob = float(probs[seg_i][-1])
            if top_prob > best_prob:
                best_prob, best_label, best_seg = top_prob, top_label, seg_i
            if top_label.startswith(sci + "_"):
                target_seen = True
                target_best_prob = max(target_best_prob, top_prob)
        print(
            f"  {kor:10s} n_seg={probs.shape[0]:3d} time={t1-t0:.2f}s "
            f"| 전체최고={best_label}({best_prob:.3f}, seg{best_seg}) "
            f"| 타겟종이1위인구간존재={target_seen}(최고conf={target_best_prob:.3f})"
        )

    print("\n=== C) GPU 사용률 스냅샷 (추론 중 nvidia-smi) ===")
    def run_nvidia_smi():
        time.sleep(0.3)
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader"],
            capture_output=True, text=True,
        )
        print("  nvidia-smi (추론 중):", out.stdout.strip())

    th = threading.Thread(target=run_nvidia_smi)
    th.start()
    session.run([str(SEG / "hypsipetes_15s.wav")])
    th.join()

    print("\n=== D) 동시 요청 1/2/4개 처리 (같은 세션에 스레드로 동시 호출) ===")
    test_files = [
        str(SEG / "hypsipetes_15s.wav"),
        str(SEG / "passer_15s.wav"),
        str(SEG / "pica_15s.wav"),
        str(SEG / "hypsipetes_10s.wav"),
    ]

    def worker(idx, fpath, results, errors):
        try:
            t0 = time.perf_counter()
            session.run([fpath])
            t1 = time.perf_counter()
            results[idx] = t1 - t0
        except Exception as e:
            errors[idx] = repr(e)

    for concurrency in [1, 2, 4]:
        results, errors = {}, {}
        threads = []
        t_start = time.perf_counter()
        for i in range(concurrency):
            th = threading.Thread(target=worker, args=(i, test_files[i % len(test_files)], results, errors))
            threads.append(th)
        for th in threads:
            th.start()
        for th in threads:
            th.join()
        t_end = time.perf_counter()
        print(
            f"  동시 {concurrency}개: 총 소요={t_end - t_start:.2f}s "
            f"개별={[round(v,2) for v in results.values()]} 에러={errors}"
        )

print("\nDONE")
