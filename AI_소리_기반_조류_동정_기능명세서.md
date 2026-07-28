# 소리 기반 조류 동정·유사도 기능 명세서 (AI 인수인계용)

> 계약 버전: `audio-mvp-v1`
> 대상 저장소/브랜치: `madcamp-official/Real_pokemongo`, `living-dex_ver2.6`
> 분석 서버: CAMP-3 GPU (`camp-3`, NVIDIA RTX 3090 24GB)
> 기준일: 2026-07-28

## 1. 이 문서의 목적

이 문서는 다른 AI 또는 개발자가 **현재 앱에 추가된 소리 기능을 이해하고, GPU 서버 구현을 이어서 완료**할 수 있도록 만든 단일 기능 명세서다. 구현 전에 아래 공통 계약도 함께 읽는다.

```text
docs/audio/DECISIONS.md       # 승인된 제품 결정
docs/audio/API_CONTRACT.md    # 외부 API의 정식 계약
docs/audio/DATA_CONTRACT.md   # 데이터/보존 정책
docs/audio/STATE_MACHINE.md   # 앱·서버 상태 전이
docs/audio/ACCEPTANCE.md      # 인수 조건
docs/audio/fixtures/          # API 응답 예시 JSON 9개
```

이 문서와 위 계약이 충돌하면 `docs/audio/`의 `audio-mvp-v1` 계약을 우선한다. 계약을 바꿔야 하면 기존 동작을 조용히 변경하지 말고 `docs/audio/CHANGE_REQUESTS.md`에 변경 요청을 먼저 남긴다.

## 2. 한 줄 요약

사용자가 주변의 **실제 새소리**를 3~15초 녹음하면, 앱이 CAMP-3 GPU의 BirdNET 기반 서버에 보내 후보 조류를 최대 3개 보여 준다. 사용자가 후보를 확정한 경우에만 도감·지도·퀘스트·보상이 갱신된다. 선택한 후보와 녹음의 음향 유사도도 별도로 보여 줄 수 있으나, 이 점수는 보상이나 도감에 영향을 주지 않는다.

## 3. 확정된 범위와 제외 범위

| 항목 | MVP 결정 |
|---|---|
| 지원 생물 | 조류만 |
| 녹음 길이 | 최소 3초, 권장 6~10초, 최대 15초 |
| 분석 위치 | CAMP-3 GPU 서버 |
| 1차 모델 | BirdNET |
| 후속 비교 모델 | Perch (MVP 밖) |
| 미확정 녹음 보관 | 업로드 뒤 최대 24시간, 그 뒤 자동 삭제 |
| 도감 등록 | 사용자가 후보 종을 확정할 때만 |
| 유사도 점수 | 도감·지도·퀘스트·보상에 영향 없음 |
| 위치 | 선택 사항. 거부해도 녹음·동정·유사도 가능 |
| 사용자 녹음 재생 | 제공하지 않음 |
| 참조 소리 재생 | 라이선스가 검증된 종 참조 음원만 제공 |

### 반드시 제외할 기능

- 사람 목소리로 새소리를 흉내 내고 점수를 매기는 `흉내/연습 게임`
- 사람 음성의 전사, 저장, 학습 데이터 사용
- 앱 안의 온디바이스 음향 모델 탑재
- 조류 외 생물의 소리 동정
- 자동 확정, 자동 도감 등록, 자동 보상 지급
- 새를 유인하기 위한 참조 음원 자동 재생

`SPEECH_DETECTED`(사람 말소리 우세)인 녹음은 분석하지 않고 즉시 폐기한다. BirdNET은 사람의 흉내 실력을 채점하는 모델이 아니므로, 흉내 게임을 나중에 넣으려면 별도 모드·별도 모델·별도 계약이 필요하다.

## 4. 사용자 경험

### 4.1 진입과 동의

1. 사용자는 방사형 메뉴의 `🎙️ 소리 찾기`로 진입한다.
2. 첫 진입 때 앱은 마이크 사용 목적, 사람 대화는 분석하지 않는다는 점, 미확정 녹음의 24시간 삭제를 안내한다.
3. 사용자가 `동의하고 시작하기`를 누른 뒤에만 운영체제 마이크 권한을 요청한다.
4. 동의 또는 권한을 거부하면 녹음하지 않고, 설정에서 다시 허용할 수 있는 안내를 보여 준다.

### 4.2 녹음

1. 준비 화면은 `6~10초`, `한 소리가 잘 들릴 때`, `동물을 따라가거나 가까이 가지 않기`, `대화 없는 곳`을 안내한다.
2. 사용자가 `소리 녹음하기`를 누르면 전경(foreground)에서만 녹음한다.
3. 녹음 화면은 경과 시간, 최대 15초, 입력 음량 미터, 중지 버튼을 표시한다.
4. 사용자가 중지하거나 15초에 도달하면 녹음을 끝낸다.
5. 3초 미만은 서버로 보내지 않는다. `3초 이상 녹음해 주세요`를 보여 주고 로컬 파일을 삭제한다.
6. 앱이 백그라운드로 가거나 통화·오디오 인터럽트·입력 장치 손실이 발생하면 녹음을 취소하고 미완성 파일을 삭제한다.

### 4.3 분석과 결과

1. 앱은 선택된 경우에만 위치를 받아 녹음과 함께 보낸다.
2. 업로드 성공 후 앱의 원본 녹음 파일은 즉시 삭제한다. 서버의 임시 분석본만 남는다.
3. 품질 통과 시 서버가 BirdNET으로 후보를 분석하고 최대 3개의 후보를 반환한다.
4. 결과 화면은 국명, 학명, 들린 구간, 확신 수준(`높음/보통/낮음`)과 위험 종 안전 안내를 보여 준다.
5. 후보가 없으면 `친구를 찾지 못했어요`로 표시한다. 이는 서버 오류가 아니라 미지원/불확실한 소리일 수 있다.
6. 사용자는 후보를 바꾸거나, `다시 녹음`, `소리 비교하기`, `참조 소리 듣기`, `이 종으로 기록하기`를 선택할 수 있다.

### 4.4 확정과 유사도

- `이 종으로 기록하기`: 서버가 반환했던 후보 중 하나만 확정할 수 있다. 성공할 때만 `modality = audio` 관찰이 1개 생성되고 도감·지도·퀘스트·XP를 기존 사진 확정 흐름과 동일하게 갱신한다.
- `소리 비교하기`: 선택 종의 라이선스된 참조 음원과 현재 **주변에서 녹음한 실제 소리**를 비교해 0~100점을 표시한다. 종일 확률도 아니고, 동정 결과를 바꾸지도 않는다.
- `참조 소리 듣기`: 짧은 만료 URL로 받은 라이선스된 참조 음원만 사용자 탭 후 재생한다. 사용자 녹음은 재생하지 않는다.

## 5. 상태와 로딩 UI 규칙

```text
ready
  -> recording
  -> local_checking
  -> uploading
  -> identifying
  -> result
  -> scoring (optional) -> result
  -> confirming (optional) -> confirmed
```

오류·취소는 어느 단계에서도 `error` 또는 `discarded`로 갈 수 있다.

- 한 번에 하나의 녹음만 가능하다.
- 로딩 UI는 `소리를 확인하는 중 → 안전하게 보내는 중 → 어떤 친구인지 찾는 중 → 참조 소리와 비교하는 중 → 도감에 기록하는 중` 사이에서 **같은 오버레이를 유지한 채 문구만 변경**한다.
- 로딩 스피너/바를 조건부로 재마운트하여 깜빡이게 하면 안 된다.
- 업로드 재시도에는 같은 `client_recording_id`를, 확정 재시도에는 같은 `confirmation_id`를 사용한다.
- 화면 닫기·다시 녹음·로그아웃 시 로컬 파일을 삭제하고, 아직 확정 전이라면 서버 임시 녹음도 삭제 요청한다.

## 6. 품질·안전 게이트

서버는 업로드 직후 디코드 및 아래 품질 검사를 실행한다. 통과하지 못한 오디오는 BirdNET 추론에 보내지 않는다.

| 코드 | 사용자 안내 요지 |
|---|---|
| `TOO_SHORT` | 3초 이상 녹음 필요 |
| `MOSTLY_SILENCE` | 생물 소리가 잘 들리지 않음 |
| `TOO_NOISY` | 바람·차량 등 주변 소음이 너무 큼 |
| `CLIPPED` | 소리가 너무 커서 왜곡됨 |
| `SPEECH_DETECTED` | 사람 대화가 포함되어 분석하지 않음 |
| `MULTIPLE_OVERLAP` | 여러 소리가 겹침 |
| `UNSUPPORTED_SOUND` | 현재 지원하지 않는 소리 |
| `NO_TARGET_ACTIVITY` | 비교할 생물 소리 구간 없음 |

서버는 다음 측정값과 유효 구간을 반환한다.

```json
{
  "usable": true,
  "duration_ms": 8120,
  "active_duration_ms": 4210,
  "snr_db": 17.4,
  "clipping_ratio": 0.001,
  "silence_ratio": 0.22,
  "speech_ratio": 0.0,
  "feedback_codes": [],
  "valid_segments": [{ "start_ms": 1100, "end_ms": 5300, "quality_score": 0.87 }]
}
```

## 7. 외부 API 계약

모든 API는 기존 로그인 세션 인증을 요구하며 JSON 키는 `snake_case`를 쓴다. 오류 형식은 아래와 같다.

```json
{
  "error": "audio_too_short",
  "message": "소리가 너무 짧아요. 3초 이상 녹음해 주세요.",
  "retryable": false,
  "trace_id": "trace_123"
}
```

### 7.1 업로드 및 품질 검사

`POST /audio/sightings/upload` — `multipart/form-data`

| 필드 | 필수 | 조건 |
|---|---:|---|
| `audio` | 예 | M4A/MP4 계열 또는 WAV, 최대 10MB |
| `client_recording_id` | 예 | UUID. 같은 녹음 업로드 재시도 때 재사용 |
| `duration_ms` | 예 | 클라이언트 측 길이, 서버 디코드 값으로 검증 |
| `recorded_at` | 예 | ISO 8601 |
| `mode` | 예 | MVP에서는 항상 `ambient` |
| `lat`, `lng` | 아니오 | 별도 위치 동의·선택 때만 |

성공 응답:

```json
{
  "audio_sighting_id": "audio-sighting-001",
  "status": "ready",
  "quality": { "usable": true, "feedback_codes": [], "valid_segments": [] },
  "expires_at": "2026-07-29T12:00:00.000Z"
}
```

- 품질 거절은 `422`, `status: rejected`와 품질 결과를 반환한다.
- 형식 오류 `400 audio_invalid_format`, 크기 초과 `413 audio_too_large`, 제한 초과 `429 audio_rate_limited`, 처리기 불가 `503 audio_processor_unavailable`을 사용한다.

### 7.2 후보 동정

`POST /audio/identify`

```json
{ "audio_sighting_id": "audio-sighting-001" }
```

```json
{
  "audio_sighting_id": "audio-sighting-001",
  "candidates": [
    {
      "species_id": "taxon-hypsipetes-amaurotis",
      "common_name_ko": "직박구리",
      "scientific_name": "Hypsipetes amaurotis",
      "confidence": 0.88,
      "confidence_level": "high",
      "start_ms": 1100,
      "end_ms": 5300,
      "is_dangerous": false
    }
  ],
  "unknown": false,
  "needs_user_confirmation": true,
  "model_version": "birdnet-...",
  "location_prior_used": false
}
```

- 최대 3개의 지원 조류 후보만 반환한다.
- `unknown: true`는 정상적인 미확정 결과다. 서버 장애와 혼동하지 않는다.
- 후보 결과는 서버에 스냅샷으로 저장해 이후 확정 검증에 사용한다.

### 7.3 사용자 확정

`POST /audio/identify/confirm`

```json
{
  "audio_sighting_id": "audio-sighting-001",
  "species_id": "taxon-hypsipetes-amaurotis",
  "confirmation_id": "uuid"
}
```

```json
{
  "observation_id": "observation-001",
  "modality": "audio",
  "species_id": "taxon-hypsipetes-amaurotis",
  "dex_updated": true,
  "reward": { "xp": 10, "quest_ids": [] }
}
```

- `species_id`는 해당 사용자의 저장된 후보 목록 중 하나여야 한다.
- 같은 `confirmation_id`의 재시도는 같은 성공 응답을 반환해야 하며 관찰/보상을 추가 생성하면 안 된다.
- 다른 요청으로 이미 확정된 녹음을 다시 확정하면 `409 already_confirmed`다.

### 7.4 유사도 채점

`POST /audio/similarity/score`

```json
{
  "audio_sighting_id": "audio-sighting-001",
  "species_id": "taxon-hypsipetes-amaurotis",
  "mode": "ambient"
}
```

```json
{
  "audio_sighting_id": "audio-sighting-001",
  "species_id": "taxon-hypsipetes-amaurotis",
  "score": 82,
  "grade": "very_similar",
  "score_reliability": "high",
  "matched_segment": { "start_ms": 1100, "end_ms": 5300 },
  "feedback_codes": [],
  "model_version": "birdnet-...",
  "reference_set_version": "kr-bird-reference@2026-07"
}
```

- `score`는 정수 0~100이다.
- `grade`: `low_similarity`, `somewhat_similar`, `very_similar`, `strong_match`.
- 점수는 **종일 확률이 아니며 제품 데이터에 부수효과가 전혀 없다.**
- 참조 세트가 없으면 `422 similarity_not_supported_for_species`를 반환한다.

### 7.5 참조 음원 조회와 삭제

- `GET /species/:species_id/sounds`: `supported_for_similarity`, `reference_set_version`, 라이선스·출처가 포함된 `clips[]`와 짧은 만료 `playback_url`을 반환한다.
- `DELETE /audio/sightings/:audio_sighting_id`: 사용자가 확정 전 녹음을 취소할 때 호출한다. 소유자에게 멱등적 `204`를 반환한다.
- 존재하지 않음, 만료, 삭제됨, 타인 소유는 모두 `404 not_found`로 응답해 타인의 존재 여부를 노출하지 않는다.

## 8. GPU/서버 구현 명세

### 8.1 구성

```text
Expo 앱
  -> 기존 seed-service (Fastify)
      -> 임시 오디오 저장소 + PostgreSQL 메타데이터
      -> CAMP-3 내부 BirdNET 추론 서비스
      -> 라이선스 참조 음원 저장소/서명 URL
```

- 모바일 앱은 모델 파일을 갖지 않는다.
- `seed-service`가 인증, 요청 검증, 임시 저장, 데이터 소유권, TTL 삭제, 기존 도감/보상 연동을 담당한다.
- CAMP-3 GPU 서비스는 품질 판정, 전처리, BirdNET 추론, 임베딩/유사도 계산만 담당한다.
- GPU 서비스는 공용 인터넷에 직접 공개하지 않고 `seed-service` 또는 내부 네트워크를 통해서만 호출한다.

### 8.2 서버 처리 순서

1. 인증과 소유자 확인
2. 최대 10MB, MIME/실제 파일 형식, 길이 검사
3. 원본의 SHA-256 생성 및 임시 암호화 저장
4. mono PCM(권장 48kHz, BirdNET 입력 요구에 맞게 리샘플)으로 변환
5. 길이·무음·클리핑·SNR·음성 우세·겹침 여부를 검사
6. 실패 시 `rejected`로 기록하고 음성 우세 녹음은 즉시 삭제
7. 통과 시 `quality_checked`, `expires_at <= 업로드 시각 + 24시간` 설정
8. `/identify` 호출에서 유효 구간을 BirdNET에 전달하고 조류 후보를 최대 3개로 제한
9. 모델 출력은 지원 종 목록·한국어 종 ID·위험 정보에 매핑하고 결과 스냅샷 저장
10. `/similarity/score`는 선택 종의 승인 참조 임베딩과 동일한 유효 구간의 임베딩을 비교
11. `/confirm`은 기존 관찰 확정 도메인 로직을 호출하되 `modality: audio`를 넣는다.

### 8.3 BirdNET 및 유사도 규칙

- 첫 버전은 BirdNET을 사용한다. 응답에 실제 `model_version`을 항상 기록한다.
- 후보 확신도는 raw classifier score를 그대로 사용자에게 단정적으로 보여 주지 말고 보정한 `0..1` 값과 `high/medium/low`로 반환한다.
- 위치는 선택 사항이며, 제공된 경우에만 지역 prior에 사용할 수 있다. 사용 여부는 `location_prior_used`에 기록한다.
- 유사도는 선택 종의 라이선스된 참조 음원으로 사전 계산한 embedding과 현재 녹음의 유효 구간 embedding을 비교한다.
- 음향 조건이 나빠 점수 신뢰도가 낮으면 `score_reliability: low`와 피드백 코드를 반환한다.
- 유사도 기능은 모델 또는 참조 세트 미지원일 때 동정을 실패시키면 안 된다.

### 8.4 저장 데이터와 보존

| 데이터 | 보존 | 비고 |
|---|---|---|
| 사용자 원본/변환 음원 | 최대 24시간 | 확정 후에도 삭제 |
| `audio_sighting` 메타데이터 | 서비스 정책에 따름 | 소유자·상태·TTL·품질 결과 포함 |
| 후보 결과 스냅샷 | 확정/TTL 검증에 필요한 기간 | 후보 위조 방지 |
| 확정된 관찰 | 기존 관찰 정책 | `modality = audio`; 음원 자체는 없음 |
| 참조 음원 | 라이선스 정책 | 사용자 계정 삭제 대상 아님 |

정기 정리 작업은 만료된 미확정 오디오의 원본과 변환본을 반드시 지운다. 사용자 계정 삭제/내보내기에는 살아 있는 오디오 메타데이터와 임시 데이터도 포함한다. 사용자 녹음은 별도 미래 동의 없이는 학습에 사용하지 않는다.

## 9. 현재 구현 상태

### 앱에서 구현됨

- `app/src/screens/SoundScreen.tsx`: 동의, 녹음, 업로드, 후보 선택, 확정, 유사도 표시, 참조 음원 재생 UI
- `app/src/hooks/useAudioRecorder.ts`: Expo Audio 전경 녹음, 3~15초 제한, 인터럽트 시 폐기
- `app/src/api/audio.ts`: 위 6개 API 클라이언트
- `app/src/mocks/audioFixtures.ts`, `app/src/mocks/mockAdapter.ts`: 서버 구현 전 개발용 목업 응답
- `app/app.json`: `expo-audio`와 Android `RECORD_AUDIO` 권한
- `app/src/store/settingsStore.ts`, `SettingsScreen.tsx`: 소리 녹음 동의 상태
- 방사형 메뉴와 탭 네비게이션의 `소리 찾기` 진입점

### GPU/서버에서 아직 구현해야 함

- 실제 `/audio/*` Fastify 라우트와 인증/소유권 검사
- 오디오 업로드·검증·PCM 변환·품질 측정 파이프라인
- BirdNET를 CAMP-3 GPU에서 실행하는 내부 추론 서비스
- 조류 후보 보정·지원 종 매핑·결과 스냅샷 저장
- 참조 음원 라이선스 메타데이터, 사전 계산 embedding, 서명 URL
- 유사도 점수·등급·신뢰도 계산
- 24시간 TTL 삭제 작업
- 기존 Observation에 `modality = audio`를 추가하는 마이그레이션 및 사진 흐름 회귀 테스트

## 10. 필수 검증 시나리오

| # | 시나리오 | 기대 결과 |
|---:|---|---|
| 1 | 8초 조류 녹음 | 업로드·동정 성공, 후보 표시 |
| 2 | 2초 녹음 | 앱에서 업로드 없이 거절 |
| 3 | 대부분 무음 | 품질 거절, 관찰/보상 없음 |
| 4 | 사람 대화 우세 | 거절, 추론/보관/전사 없음 |
| 5 | 후보만 보고 닫기 | 도감·지도·퀘스트·XP 변경 없음 |
| 6 | 정상 후보 확정 | `audio` 관찰 정확히 1개, 기존 갱신 정상 |
| 7 | 확정 요청 3회 재시도 | 관찰·보상은 정확히 1회 |
| 8 | 유사도 요청 | 점수만 표시, 제품 데이터 변경 없음 |
| 9 | 참조 세트 없는 종 | 명시적 미지원 응답, 동정 흐름은 유지 |
| 10 | 네트워크/GPU 오류 | 재시도 가능 오류, `unknown`으로 위장하지 않음 |
| 11 | 24시간 만료/수동 삭제 | 이후 동정·유사도·확정 모두 404 |
| 12 | 사진 기존 기능 | 촬영·동정·도감·지도·가든·보상에 회귀 없음 |
| 13 | 앱 백그라운드 중 녹음 | 미완성 파일 삭제, 업로드 없음 |
| 14 | 로딩 단계 전환 | 스피너가 사라졌다 나타나지 않고 문구만 변경 |

## 11. AI 작업 지시

1. 먼저 `docs/audio/`와 이 문서를 모두 읽고, API 키/필드/상태 값을 임의로 바꾸지 않는다.
2. 앱과 GPU 서버를 분리해 작업한다. 사진 동정 엔드포인트(`/sightings/*`, `/identify`)를 오디오 구현을 위해 재사용하거나 바꾸지 않는다.
3. 오디오 관련 실패는 기존 사진 흐름에 영향을 주지 않는 별도 오류 코드와 UI로 처리한다.
4. 확인 전에는 어떠한 관찰·도감·지도·퀘스트·보상 쓰기도 하지 않는다.
5. 사용자가 제공하지 않은 좌표를 생성하지 않고, 사람 음성을 저장·전사·학습하지 않는다.
6. 서버 구현 뒤 `docs/audio/fixtures/`의 모든 응답 예시와 위 검증 시나리오를 자동 테스트로 만든다.
7. 실제 BirdNET/참조 세트의 모델·라이선스 정보가 확정되기 전까지는 응답에 가짜 성공 모델 버전이나 가짜 참조 URL을 운영 환경에서 반환하지 않는다.
