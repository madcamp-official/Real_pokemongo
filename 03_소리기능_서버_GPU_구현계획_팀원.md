# 03. 소리 기능 서버·GPU 구현계획 — 팀원 담당

> 담당자: 팀원
>
> 작업 브랜치: `feature/audio-server-gpu`
>
> 시작 기준: `COMMON_DESIGN_COMMIT`
>
> 수정 범위: `seed-service/` 및 별도 모델 서비스
>
> 배포 대상: CAMP-3 GPU 서버
>
> 계약 기준: `docs/audio/API_CONTRACT.md`, `docs/audio/DATA_CONTRACT.md`, `docs/audio/fixtures/`

---

## 1. 목표

현재 TypeScript Fastify 서버에 인증, 오디오 세션, DB, 관찰 확정 API를 추가하고 CAMP-3에 BirdNET 기반 분석 서비스를 배포한다.

권장 구조:

```text
모바일 앱
  ↓ 외부 /audio API
Fastify seed-service
  ├─ 인증·소유권
  ├─ 업로드·임시 저장
  ├─ DB·TTL·확정·보상
  └─ 모델 서비스 호출
          ↓ 내부 전용 API
CAMP-3 audio-model-service
  ├─ 디코딩·리샘플링
  ├─ 품질 검사
  ├─ BirdNET 동정
  └─ 임베딩·유사도 계산
```

Node 서버는 제품 상태를 책임지고 Python 모델 서비스는 순수 분석 결과만 반환한다.

---

## 2. 파일 소유 범위

주요 수정 경로:

```text
seed-service/db/
seed-service/src/config/
seed-service/src/core/audio/
seed-service/src/core/media/
seed-service/src/core/observation/
seed-service/src/core/domain/types.ts
seed-service/src/http/routes/audio.routes.ts
seed-service/src/http/server.ts
seed-service/src/composition.ts
seed-service/src/child/ObservationFlow.ts
audio-model-service/
```

수정 금지:

```text
app/
docs/audio/API_CONTRACT.md
docs/audio/fixtures/
```

공통 계약 변경이 필요하면 `docs/audio/CHANGE_REQUESTS.md`에 요청하고 사용자 승인을 기다린다.

---

## 3. 0단계 — 시작 준비

- [ ] `feature/audio-server-gpu` 브랜치 확인
- [ ] `COMMON_DESIGN_COMMIT`에서 시작했는지 확인
- [ ] 현재 서버 타입 검사와 테스트 실행
- [ ] CAMP-3 접속과 디스크·메모리·GPU 상태 확인
- [ ] 모델 파일 및 캐시 위치 결정
- [ ] 비밀정보를 저장소에 기록하지 않도록 환경변수 목록 작성

필수 보안:

- GPU 주소, root 계정, 비밀번호, 토큰을 Git에 커밋하지 않는다.
- 외부 `/audio` API에서 모델 서비스 내부 주소를 노출하지 않는다.

---

## 4. 1단계 — BirdNET 기술 검증

본 구현 전에 작은 spike로 확인한다.

검증 항목:

- BirdNET 설치 버전과 라이선스
- 실제 지원 종 목록
- 조류 분류 점수 출력
- 임베딩 추출 가능 여부
- M4A 입력 지원 여부
- WAV mono PCM 변환 필요 여부
- CPU/GPU 사용 방식과 실제 GPU 가속 여부
- 3초, 6초, 10초, 15초 입력 지연
- 동시 요청 1·2·4개 처리
- 한국 조류 이름을 현재 taxon ID로 매핑할 수 있는지

중요:

- CAMP-3에 올렸다는 이유로 실제 GPU를 사용한다고 가정하지 않는다.
- BirdNET 런타임이 CPU 중심이면 이를 측정 결과에 명시한다.
- 성능이 부족할 때만 Perch 또는 별도 GPU 추론 경로를 검토한다.

spike 산출물:

```text
모델 버전
설치 방법
지원 입력 형식
평균/P95 지연
CPU/GPU 사용량
샘플 입력과 원시 결과
현재 seed 종 매핑 결과
라이선스 검토 메모
```

완료 기준:

- 직박구리, 참새, 까치 중 모델이 지원하는 종을 확인한다.
- 동일 파일 반복 추론 결과가 안정적이다.
- 모델 장애를 탐지할 health/readiness 방법이 있다.

---

## 5. 2단계 — 모델 서비스

권장:

- Python 기반 독립 프로세스
- 외부 공개 금지
- Fastify 서버에서만 호출
- 버전이 고정된 컨테이너 또는 재현 가능한 환경

내부 기능:

```text
POST /internal/audio/analyze
POST /internal/audio/similarity
GET /health
GET /ready
```

분석 요청:

- 오디오 바이트 또는 안전한 내부 객체 참조
- 유효 구간
- 선택적 지역·시간 보조 정보

분석 응답:

- 원시 후보
- 구간
- 원시 점수
- 임베딩 또는 임베딩 참조
- 품질 지표
- 모델 버전

금지:

- 앱 인증 처리
- 도감·보상 수정
- DB 직접 수정
- 외부 사용자가 파일 경로 지정

완료 기준:

- 모델 서비스는 같은 입력에 재현 가능한 JSON을 반환한다.
- 잘못된 오디오와 과도한 요청을 안전하게 거부한다.

---

## 6. 3단계 — 오디오 업로드와 변환

Fastify 작업:

- `POST /audio/sightings/upload`
- 인증과 사용자 소유권
- multipart 파일 제한
- `client_recording_id` 멱등성
- 파일 시그니처 검사
- 최대 10 MB
- 길이 최대 15초
- 임시 저장
- 변환 서비스 호출

표준화:

- 입력: M4A/MP4 계열 및 WAV
- 출력: 모델 권장 샘플레이트의 mono PCM
- 기본 목표: 48 kHz mono PCM WAV
- 확장자나 클라이언트 MIME을 신뢰하지 않음

변환기 보호:

- CPU·메모리·시간 제한
- 임의 파일 경로 금지
- 명령 인자 안전 처리
- 손상 파일과 압축 폭탄 거부
- 임시 변환 파일 정리

완료 기준:

- 정상 모바일 녹음이 표준 PCM으로 변환된다.
- 잘못된 파일이 모델에 전달되지 않는다.

---

## 7. 4단계 — 품질 검사와 음성 보호

검사 순서:

1. 형식과 크기
2. 디코딩
3. 길이
4. 무음 비율
5. 클리핑 비율
6. 신호 대 잡음비
7. 사람 음성 감지
8. 목표 음향 활동 구간
9. 여러 소리 겹침

오류 코드:

```text
TOO_SHORT
MOSTLY_SILENCE
TOO_NOISY
CLIPPED
SPEECH_DETECTED
MULTIPLE_OVERLAP
UNSUPPORTED_SOUND
NO_TARGET_ACTIVITY
```

사람 음성:

- 음성 우세 녹음은 분석하지 않는다.
- 음성 전사나 화자 식별을 하지 않는다.
- 음성 우세 파일은 장기 저장하지 않는다.
- 로그에 원본 음성 또는 음성 특징을 남기지 않는다.

완료 기준:

- fixture의 모든 품질 코드와 동일한 응답을 반환한다.
- 음성 우세 테스트 파일은 BirdNET으로 전달되지 않는다.

---

## 8. 5단계 — DB와 임시 세션

기존 관찰 변경:

```text
observation.modality
  "photo" | "audio"
기존 행 기본값
  "photo"
```

미디어 변경:

```text
media_kind
mime_type
duration_ms
sha256
retention_class
derived_from_media_id
```

신규 테이블 또는 동등 저장소:

```text
audio_sighting
audio_identification_result
species_sound_reference
```

제약:

- `(user_id, client_recording_id)` unique
- `expires_at` 인덱스
- 세션 소유권 확인
- 후보 결과 스냅샷 저장
- 한 세션에서 관찰 확정 1회

TTL:

- 미확정 세션은 최대 24시간
- 삭제 작업 재시도와 실패 모니터링
- DB 행, 원본, 변환본을 함께 정리

마이그레이션 안전:

- 기존 사진 레코드를 변경하지 않는다.
- 기존 쿼리가 `modality` 추가 후에도 동작해야 한다.
- 롤백 또는 forward-fix 절차를 기록한다.

완료 기준:

- 기존 DB 통합 테스트가 통과한다.
- 기존 관찰은 전부 `photo`로 해석된다.

---

## 9. 6단계 — 소리 동정 API

구성:

```text
AudioIdentificationProvider
AudioIdentificationGateway
BirdNetAudioProvider
AudioQualityService
AudioSightingStore
```

`POST /audio/identify`:

- 사용자와 세션 소유권 확인
- 품질 통과 세션만 허용
- 모델 서비스 호출
- 모델 학명을 현재 taxon ID로 매핑
- 지원 조류만 최대 3개 반환
- 결과 스냅샷 저장
- 모델 버전 포함

규칙:

- 관찰·도감·퀘스트·보상 변경 금지
- 모델 오류는 5xx로 반환
- 후보 없음은 `unknown: true`
- 미지원 모델 종은 확정 후보에서 제외

완료 기준:

- fixture와 필드·타입·오류 코드가 일치한다.

---

## 10. 7단계 — 확정과 기존 기능 연동

`POST /audio/identify/confirm`:

- 인증
- 세션 소유권
- 후보 스냅샷 검증
- `confirmation_id` 멱등성
- 오디오 Observation 생성
- 도감 반영
- 보상 정확히 한 번
- 위치 동의가 있을 때만 지도용 위치 연결

기존 흐름과의 관계:

- 사진 `/identify/confirm` 동작을 변경하지 않는다.
- 공통 ObservationFlow를 확장하더라도 photo가 기본 동작이다.
- 기존 퀘스트는 오디오를 자동 인정하지 않는다.
- 유사도 API는 ObservationFlow를 호출하지 않는다.

완료 기준:

- 동일 요청 3회에 관찰 1건, 보상 1회다.
- 후보에 없는 종 확정은 거부된다.

---

## 11. 8단계 — 참조 음원과 유사도

참조 음원 메타데이터:

```text
taxon_id
call_type
region
season
source_url
creator
license
attribution
quality_status
reference_set_version
embedding_model_version
```

출시 전 제안:

- 종별 검증 구간 최소 20개
- 서로 다른 녹음 세션 최소 5개
- 혼동종 참조 포함
- 라이선스와 앱 재생 권한 확인

계산:

```text
positiveSimilarity = target reference top-K 집계
confuserMargin = target similarity - best confuser similarity
qualityFactor = 품질 기반 0..1
score = 교정기 결과를 0..100으로 변환
```

규칙:

- 코사인 유사도 단순 100배 금지
- 모델 및 참조 집합 버전 포함
- 참조 부족 종은 `SIMILARITY_NOT_SUPPORTED_FOR_SPECIES`
- 점수 영구 저장은 MVP 제외
- 관찰·보상 부수효과 없음

완료 기준:

- 동일 입력과 버전의 점수 차이가 ±3 이내다.
- 목표 종과 주요 혼동종의 순위가 검증 세트에서 합리적이다.

---

## 12. 9단계 — 설정과 배포

환경변수 예시:

```text
AUDIO_MODEL_SERVICE_URL
AUDIO_MODEL_SERVICE_TOKEN
AUDIO_MODEL_NAME
AUDIO_MODEL_VERSION
AUDIO_REFERENCE_SET_VERSION
AUDIO_TEMP_DIR
AUDIO_TEMP_TTL_HOURS=24
AUDIO_MAX_BYTES
AUDIO_MAX_DURATION_SECONDS=15
AUDIO_ANALYSIS_TIMEOUT_MS
```

원칙:

- 실제 값과 자격 증명은 `.env.example`에 넣지 않는다.
- `.env.example`에는 키 이름과 설명만 추가한다.
- 모델 파일과 참조 음원을 Git에 직접 넣지 않는다.
- readiness는 모델과 참조 임베딩이 모두 준비된 뒤 성공한다.

배포 확인:

- 서비스 자동 재시작
- 로그 회전
- 디스크 사용량 경고
- TTL 삭제 작업
- 모델 cold start 시간
- 동시 요청 제한
- Fastify에서 모델 장애 격리

완료 기준:

- CAMP-3 재부팅 또는 서비스 재시작 후 readiness가 정상 복구된다.

---

## 13. 10단계 — 서버·GPU 테스트

단위 테스트:

- 오디오 형식 검증
- 길이·크기 제한
- 품질 코드
- taxon 매핑
- 후보 필터
- 유사도 계산
- TTL 판정

통합 테스트:

- 업로드 → 품질 → 동정
- 동정 전 부수효과 없음
- 확정 → 관찰·도감·보상
- 동일 확정 3회
- 남의 세션
- 삭제·만료 세션
- 모델 타임아웃
- 미지원 종
- 유사도 성공·실패

회귀 테스트:

- 기존 사진 업로드
- 사진 동정
- 사진 확정
- 지도 핀
- 도감
- 퀘스트
- 보상
- 계정 데이터 삭제

성능 측정:

- 10초 입력의 평균/P95
- 동시 요청별 지연
- CPU, RAM, GPU, VRAM
- 변환과 모델 추론 시간 분리

완료 기준:

- 서버 build, typecheck, test 통과
- 모델 서비스 테스트 통과
- fixture 계약 테스트 통과
- 기존 기능 회귀 테스트 통과

---

## 14. 권장 커밋 순서

```text
feat(audio-server): add audio domain and database migration
feat(audio-server): add upload validation and temporary storage
feat(audio-model): add BirdNET analysis service
feat(audio-server): add identification and confirmation routes
feat(audio-model): add reference similarity scoring
test(audio-server): cover idempotency privacy and regressions
ops(audio-model): add CAMP-3 deployment and readiness
```

각 커밋은 `docs/audio` 계약을 직접 변경하지 않는다.

---

## 15. 팀원이 사용자에게 전달할 결과

- [ ] 서버·GPU 브랜치 최신 커밋 SHA
- [ ] DB 마이그레이션과 적용 순서
- [ ] 모델 서비스 설치·시작·중지 방법
- [ ] CAMP-3 readiness 확인 방법
- [ ] 환경변수 키 목록
- [ ] BirdNET 버전과 라이선스 메모
- [ ] 지원 조류 매핑 목록
- [ ] 성능 측정 결과
- [ ] fixture 계약 테스트 결과
- [ ] 알려진 제한사항
- [ ] 공통 계약 변경 요청 목록

사용자가 이 전달물을 확인한 뒤 `feature/audio-integration` 브랜치에 병합한다.
