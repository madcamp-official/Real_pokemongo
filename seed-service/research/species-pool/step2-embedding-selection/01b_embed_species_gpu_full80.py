# -*- coding: utf-8 -*-
"""
2단계 재작업: GPU 드라이버 복구 후, CPU 우회(4템플릿) 대신 라이브 서비스와 완전히
동일한 조건(GPU + 공식 80개 프롬프트 템플릿 전체)으로 1000종 임베딩을 재계산한다.

기존 CPU+4템플릿 결과(embeddings.npy)는 그대로 보존하고, 이번 결과는 별도 파일
(embeddings_full80_gpu.npy)로 저장한다 -- 02_compare_embeddings.py에서 두 결과를
직접 비교/검증한 뒤에만 기존 파일을 교체할지 판단한다.
"""
import json
import time

import torch
from bioclip.predict import CustomLabelsClassifier

MODEL_STR = "hf-hub:imageomics/bioclip-2.5-vith14"

with open("/root/livingdex_step2/universe.json", encoding="utf-8") as f:
    universe = json.load(f)

species = universe["species"]
sci_names = [s["sciName"] for s in species]
print(f"총 {len(sci_names)}종 임베딩 계산 시작 (model={MODEL_STR}, device=cuda, 템플릿=80개 전체)")
assert len(sci_names) == len(set(sci_names)), "학명 중복 발견 -- universe.json 오류"

mem_free_before_mib = (torch.cuda.mem_get_info()[0]) / 1024**2
print(f"작업 시작 전 GPU 여유 메모리: {mem_free_before_mib:.1f} MiB")

t0 = time.time()
clf = CustomLabelsClassifier(cls_ary=sci_names, model_str=MODEL_STR, device="cuda")
elapsed = time.time() - t0
print(f"임베딩 계산 완료: {elapsed:.1f}초")

embeddings = clf.txt_embeddings.T.cpu().numpy()  # (N, embed_dim)
print(f"임베딩 shape: {embeddings.shape}")

# 정합성 검증: L2 정규화.
norms = (embeddings ** 2).sum(axis=1) ** 0.5
max_dev = abs(norms - 1.0).max()
print(f"L2 정규화 검증: max |norm-1| = {max_dev:.6f}")
assert max_dev < 1e-3, "임베딩이 L2 정규화되지 않음"

# 정합성 검증: NaN/Inf 없음.
import numpy as np
assert np.isfinite(embeddings).all(), "임베딩에 NaN/Inf 존재"

np.save("/root/livingdex_step2/embeddings_full80_gpu.npy", embeddings)
with open("/root/livingdex_step2/embeddings_full80_gpu_index.json", "w", encoding="utf-8") as f:
    json.dump(
        {"sciNames": sci_names, "model_str": MODEL_STR, "embed_dim": int(embeddings.shape[1]),
         "device": "cuda", "templateCount": 80, "elapsedSeconds": round(elapsed, 1)},
        f, ensure_ascii=False,
    )

mem_free_after_mib = (torch.cuda.mem_get_info()[0]) / 1024**2
print(f"작업 종료 후 GPU 여유 메모리: {mem_free_after_mib:.1f} MiB (프로세스 종료 시 완전 반환됨)")
print("저장 완료: embeddings_full80_gpu.npy, embeddings_full80_gpu_index.json")
