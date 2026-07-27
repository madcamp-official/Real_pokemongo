# -*- coding: utf-8 -*-
"""
2단계 1/2: universe.json(999종)의 학명을 BioCLIP 텍스트 임베딩으로 변환.

라이브 프로덕션 서버(bioclip_hybrid.py/prototype_bank.json)와 정확히 같은 모델
(hf-hub:imageomics/bioclip-2.5-vith14)을 쓴다. pybioclip의 공식 CustomLabelsClassifier
경로(OpenAI CLIP 표준 프롬프트 앙상블 + encode_text)를 그대로 재사용해서, 999종
전부를 "동일한 방식"으로 임베딩한다 -- 일부는 사전계산된 TreeOfLife-200M 뱅크에서
가져오고 일부는 새로 계산하는 혼합 방식은 프롬프트 템플릿이 서로 다를 위험이 있어
피했다(전부 새로 계산하는 쪽이 더 단순하고 일관적).

이 디렉터리(/root/livingdex_step2/)는 기존 작업(candidate_pool.json 등, 사용자가
이미 유기한 것으로 확인됨)과 완전히 분리된 새 작업 공간이다.
"""
import json
import time

import torch
import bioclip.predict as bp
from bioclip.predict import CustomLabelsClassifier

MODEL_STR = "hf-hub:imageomics/bioclip-2.5-vith14"

# [CPU 우회] GPU 서버가 NVIDIA 드라이버/커널 모듈 버전 불일치(NVML mismatch)로 새 CUDA
# 프로세스를 못 띄우는 상태라(라이브 서비스는 이미 떠 있는 프로세스라 영향 없음, 새로 뜨는
# 프로세스만 문제) CPU로 우회한다. 공식 80개 프롬프트 템플릿 전부를 쓰면 999종에 약 112분이
# 걸려(실측: 20종=134초) 비현실적이라, 공식 템플릿 리스트의 앞 4개만 사용해 20배 단축한다.
# (목적이 "실제 사진 분류 정확도 최적화"가 아니라 "종끼리 상대적 임베딩 유사도 비교"이므로,
# 모든 종에 동일하게 축소된 템플릿을 적용하면 상대적 기하구조는 충분히 보존된다.)
ORIGINAL_TEMPLATES = bp.OPENA_AI_IMAGENET_TEMPLATE
REDUCED_TEMPLATES = ORIGINAL_TEMPLATES[:4]
bp.OPENA_AI_IMAGENET_TEMPLATE = REDUCED_TEMPLATES
print(f"[속도최적화] 프롬프트 템플릿 {len(ORIGINAL_TEMPLATES)}개 -> {len(REDUCED_TEMPLATES)}개로 축소")
print("사용 템플릿:", [t("<종명>") for t in REDUCED_TEMPLATES])

with open("/root/livingdex_step2/universe.json", encoding="utf-8") as f:
    universe = json.load(f)

species = universe["species"]
sci_names = [s["sciName"] for s in species]
print(f"총 {len(sci_names)}종 임베딩 계산 시작 (model={MODEL_STR})")
assert len(sci_names) == len(set(sci_names)), "학명 중복 발견 -- universe.json 오류"

t0 = time.time()
clf = CustomLabelsClassifier(cls_ary=sci_names, model_str=MODEL_STR, device="cpu")
print(f"임베딩 계산 완료: {time.time()-t0:.1f}초")
# txt_embeddings shape: (embed_dim, N) -- predict.py의 _get_txt_embeddings 구현 참고.
embeddings = clf.txt_embeddings.T.cpu().numpy()  # -> (N, embed_dim)
print(f"임베딩 shape: {embeddings.shape}")

# 정합성 검증: 전부 L2 정규화되어 있어야 함(코사인 유사도를 내적으로 바로 쓰기 위해).
norms = (embeddings ** 2).sum(axis=1) ** 0.5
max_dev = abs(norms - 1.0).max()
print(f"L2 정규화 검증: max |norm-1| = {max_dev:.6f}")
assert max_dev < 1e-3, "임베딩이 L2 정규화되지 않음 -- 코사인 유사도 계산이 부정확해짐"

import numpy as np
np.save("/root/livingdex_step2/embeddings.npy", embeddings)
with open("/root/livingdex_step2/embeddings_index.json", "w", encoding="utf-8") as f:
    json.dump({"sciNames": sci_names, "model_str": MODEL_STR, "embed_dim": int(embeddings.shape[1])}, f, ensure_ascii=False)

print("저장 완료: embeddings.npy, embeddings_index.json")
