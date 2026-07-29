# 도감 박사 CPU 임베딩 워커

이 프로세스는 질문과 검수된 도감 문장을 384차원 벡터로 바꾸기만 한다. 사용자 도감
상태, 안전 정책, 답변 문구는 모두 TypeScript `seed-service`가 소유한다.

## 로컬 실행

```powershell
cd seed-service/embedding-worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[test]"
uvicorn professor_worker.api:app --host 127.0.0.1 --port 8941
```

워커를 외부 네트워크에 직접 노출하지 않는다. CAMP-3에서도 반드시 `127.0.0.1`에
바인딩하고, `seed-service/.env`에 아래 값을 설정한다.

```text
PROFESSOR_EMBEDDING_ENDPOINT=http://127.0.0.1:8941
```

## 지식과 벡터 인덱스 생성

```powershell
cd seed-service
npm run professor:knowledge
cd embedding-worker
python -m professor_worker.build_index
```

콘텐츠 또는 모델 리비전이 바뀔 때만 다시 생성한다. 워커는 CPU를 강제하므로 기존
BioCLIP GPU 메모리에 영향을 주지 않는다.

