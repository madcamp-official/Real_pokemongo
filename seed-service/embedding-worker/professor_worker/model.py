from __future__ import annotations

import os
from functools import lru_cache
from typing import Iterable

from sentence_transformers import SentenceTransformer

MODEL_ID = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
# 2026-07-28에 확인한 모델 저장소 HEAD. 인덱스와 런타임이 같은 가중치를 쓰도록 고정한다.
MODEL_REVISION = os.getenv(
    "PROFESSOR_MODEL_REVISION",
    "e8f8c211226b894fcb81acc59f3b34ba3efd5f42",
)
DIMENSION = 384


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    # device="cpu"를 강제해 CAMP-3의 BioCLIP GPU 메모리를 침범하지 않는다.
    return SentenceTransformer(MODEL_ID, revision=MODEL_REVISION, device="cpu")


def embed_texts(texts: Iterable[str]) -> list[list[float]]:
    values = [text.strip() for text in texts]
    if not values or any(not value for value in values):
        raise ValueError("빈 문장은 임베딩할 수 없습니다.")
    vectors = get_model().encode(
        values,
        batch_size=min(32, len(values)),
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    if vectors.shape[1] != DIMENSION:
        raise RuntimeError(
            f"임베딩 차원이 다릅니다: expected={DIMENSION}, actual={vectors.shape[1]}"
        )
    return vectors.astype("float32").tolist()


def model_metadata() -> dict[str, object]:
    return {
        "model_id": MODEL_ID,
        "model_revision": MODEL_REVISION,
        "dimension": DIMENSION,
        "normalized": True,
    }

