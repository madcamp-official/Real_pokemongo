from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .model import embed_texts, get_model, model_metadata

app = FastAPI(
    title="Nature Go Professor Embedding Worker",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


class EmbedRequest(BaseModel):
    text: str = Field(min_length=2, max_length=200)


class BatchEmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=1024)


@app.get("/health")
def health() -> dict[str, object]:
    # health가 성공하면 모델 파일 로드까지 끝났다는 뜻이어야 한다.
    get_model()
    return {"status": "ok", **model_metadata()}


@app.post("/embed")
def embed(request: EmbedRequest) -> dict[str, object]:
    try:
        vector = embed_texts([request.text])[0]
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {**model_metadata(), "vector": vector}


@app.post("/embed-batch")
def embed_batch(request: BatchEmbedRequest) -> dict[str, object]:
    if any(len(text.strip()) < 2 or len(text) > 500 for text in request.texts):
        raise HTTPException(status_code=400, detail="각 문장은 2~500자여야 합니다.")
    try:
        vectors = embed_texts(request.texts)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {**model_metadata(), "vectors": vectors}

