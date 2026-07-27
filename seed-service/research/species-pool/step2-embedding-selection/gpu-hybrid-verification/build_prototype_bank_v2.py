# -*- coding: utf-8 -*-
"""
PrototypeBank 확장: 기존 유혈목이 항목은 그대로 유지하고, 오픈셋(TreeOfLife-200M)에
학명이 아예 없어 항상 INCONCLUSIVE였던 3종(흰부채하루살이/줄날도래/네점하루살이)을
GBIF에서 라이선스 확인된 실제 참조사진으로 추가한다.

기존 build_prototype_bank.py와 동일한 모델 로딩 방식(huge 이미지 인코더 재사용)을
그대로 따르되, 이번엔 종별로 "프로토타입용 N-1장 + held-out 1장(있으면)"으로 나눠서
평균 계산 직후 곧바로 held-out 교차검증까지 같은 스크립트에서 수행한다(기존엔 이 부분이
스크립트 밖에서 별도로 됐던 것으로 보이나, 재현성을 위해 이번엔 한 스크립트에 통합).
"""
import gc
import json

import torch
import torch.nn.functional as F
from PIL import Image
import open_clip

HUGE_MODEL_STR = 'hf-hub:imageomics/bioclip-2.5-vith14'

# 프로토타입 생성에 쓸 참조사진(기존 유혈목이는 그대로 유지).
REFERENCE_SETS = {
    'Rhabdophis tigrinus': [
        '/root/prototype_images/rhabdophis_tigrinus/ref1.jpg',
        '/root/prototype_images/rhabdophis_tigrinus/ref2.jpg',
        '/root/prototype_images/rhabdophis_tigrinus/ref3.jpg',
        '/root/prototype_images/rhabdophis_tigrinus/ref4.jpg',
    ],
    'Epeorus pellucidus': [
        '/root/prototype_refs/epeorus_pellucidus/img1.jpeg',
        '/root/prototype_refs/epeorus_pellucidus/img2.jpeg',
        '/root/prototype_refs/epeorus_pellucidus/img3.jpeg',
        '/root/prototype_refs/epeorus_pellucidus/img4.jpeg',
    ],
    'Cheumatopsyche brevilineata': [
        '/root/prototype_refs/cheumatopsyche_brevilineata/img1.jpg',
    ],
    'Ecdyonurus kibunensis': [
        '/root/prototype_refs/ecdyonurus_kibunensis/img1.jpg',
    ],
}

# held-out 검증용(프로토타입 계산엔 안 씀). 없는 종은 생략.
HELDOUT = {
    'Rhabdophis tigrinus': '/root/prototype_images/rhabdophis_tigrinus/test1.jpg',
    'Epeorus pellucidus': '/root/prototype_refs/epeorus_pellucidus/img5.jpeg',
    'Cheumatopsyche brevilineata': '/root/prototype_refs/cheumatopsyche_brevilineata/img2.jpg',
    # Ecdyonurus kibunensis: 참조사진이 1장뿐이라 held-out 불가(알려진 한계로 문서화).
}

ok = True
def check(name, cond, detail=''):
    global ok
    status = 'PASS' if cond else 'FAIL'
    if not cond:
        ok = False
    print('[' + status + '] ' + name + ' ' + detail)

print('=== PrototypeBank v2: 4종 (기존 1 + 신규 3) ===')
model, _, preprocess = open_clip.create_model_and_transforms(HUGE_MODEL_STR)
model = model.to('cuda').eval()


def embed_image(path):
    img = Image.open(path).convert('RGB')
    x = preprocess(img).unsqueeze(0).to('cuda')
    with torch.no_grad():
        feat = model.encode_image(x)
        feat = F.normalize(feat, dim=-1)
    return feat.squeeze(0)


bank = {}
prototypes_tensor = {}

with torch.no_grad():
    for sci, paths in REFERENCE_SETS.items():
        embs = [embed_image(p) for p in paths]
        stacked = torch.stack(embs)  # (N, 1024)

        if len(paths) >= 2:
            pairwise = stacked @ stacked.T
            n = pairwise.shape[0]
            off_diag = pairwise[~torch.eye(n, dtype=torch.bool, device=pairwise.device)]
            min_pairwise = off_diag.min().item()
            mean_pairwise = off_diag.mean().item()
            check(sci + ' 참조사진 간 최소 유사도 >= 0.3',
                  min_pairwise >= 0.3, '(min=' + format(min_pairwise, '.3f') + ', mean=' + format(mean_pairwise, '.3f') + ', n=' + str(len(paths)) + ')')
        else:
            print('  [주의] ' + sci + ': 참조사진 1장뿐 -- 페어와이즈 일관성 검증 불가(문서화된 한계)')

        proto = stacked.mean(dim=0)
        proto = F.normalize(proto, dim=0)
        norm_check = proto.norm().item()
        check(sci + ' 프로토타입 L2 정규화됨', abs(norm_check - 1.0) < 1e-4, '(norm=' + format(norm_check, '.6f') + ')')

        bank[sci] = proto.cpu().tolist()
        prototypes_tensor[sci] = proto
        print('  ' + sci + ': 참조 ' + str(len(paths)) + '장으로 프로토타입 생성 완료')

    print()
    print('=== held-out 교차검증(프로토타입 계산에 안 쓴 별도 사진) ===')
    for sci, path in HELDOUT.items():
        held_feat = embed_image(path)
        # 이 held-out 사진이 "자기 종" 프로토타입과 가장 가까운지, 다른 종들과는 얼마나 떨어져 있는지.
        sims = {other_sci: torch.dot(held_feat, proto).item() for other_sci, proto in prototypes_tensor.items()}
        best_sci = max(sims, key=sims.get)
        own_sim = sims[sci]
        check(sci + ' held-out이 자기 프로토타입에 가장 가까움',
              best_sci == sci,
              '(own_sim=' + format(own_sim, '.4f') + ', best_match=' + best_sci + ', all=' + str({k: round(v, 4) for k, v in sims.items()}) + ')')
        check(sci + ' held-out 유사도가 MIN_PROTOTYPE_SIMILARITY(0.4) 이상',
              own_sim >= 0.4, '(own_sim=' + format(own_sim, '.4f') + ')')

with open('/root/prototype_bank.json', 'w', encoding='utf-8') as f:
    json.dump({'model_str': HUGE_MODEL_STR, 'embed_dim': 1024, 'prototypes': bank}, f)

print()
print('저장 완료: /root/prototype_bank.json (' + str(len(bank)) + '종: ' + ', '.join(bank.keys()) + ')')

del model
gc.collect()
torch.cuda.empty_cache()
print('정리 후 GPU 메모리: ' + format(torch.cuda.memory_allocated()/(1024**3), '.2f') + 'GB')

print()
print('=== 전체 결과: ' + ('PASS' if ok else 'FAIL') + ' ===')
import sys
sys.exit(0 if ok else 1)
