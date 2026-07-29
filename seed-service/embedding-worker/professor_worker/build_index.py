from __future__ import annotations

import hashlib
import json
from pathlib import Path

from professor_worker.model import embed_texts, model_metadata

SERVICE_DIR = Path(__file__).resolve().parents[2]
KNOWLEDGE_PATH = SERVICE_DIR / "data" / "professor-knowledge.json"
OUTPUT_PATH = SERVICE_DIR / "data" / "professor-knowledge-vectors.json"


def main() -> None:
    source = json.loads(KNOWLEDGE_PATH.read_text(encoding="utf-8"))
    if source.get("schema_version") != "professor-knowledge-v1":
        raise RuntimeError("지원하지 않는 지식 스키마입니다.")
    records = source.get("records")
    if not isinstance(records, list) or not records:
        raise RuntimeError("임베딩할 지식 문장이 없습니다.")

    sentences = [record["sentence"] for record in records]
    vectors = embed_texts(sentences)
    vector_records = [
        {**record, "vector": vector} for record, vector in zip(records, vectors, strict=True)
    ]
    output = {
        "schema_version": "professor-knowledge-v1",
        **model_metadata(),
        "content_hash": source["content_hash"],
        "records": vector_records,
    }
    serialized = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    OUTPUT_PATH.write_text(f"{serialized}\n", encoding="utf-8")
    file_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    print(
        f"{len(vector_records)}개 문장의 벡터 인덱스를 저장했습니다: "
        f"{OUTPUT_PATH} (sha256={file_hash})"
    )


if __name__ == "__main__":
    main()

