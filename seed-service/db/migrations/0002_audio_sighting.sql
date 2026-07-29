-- 0002_audio_sighting: 3단계(오디오 업로드와 변환)가 필요로 하는 최소 저장소.
--
-- doc 03의 5단계("DB와 임시 세션")가 정의하는 audio_sighting/audio_identification_result/
-- species_sound_reference 3개 테이블 중, 지금은 3단계(업로드~변환) 완료에 실제로 필요한
-- audio_sighting 하나만 만든다. 나머지 두 테이블과 observation.modality 컬럼 변경은
-- 각자 필요한 단계(6단계 소리 동정 API, 8단계 참조 음원)에서 추가한다 — 미리 만들어두면
-- 아직 값을 채울 코드가 없는 빈 테이블/컬럼이 먼저 생겨 스키마와 코드가 어긋난다.
--
-- 설계 메모:
--   - 사진 파이프라인(PendingSightingStore)과 달리 의도적으로 DB 영속 + TTL이다 —
--     기존 review에서 이미 확인한 요구사항(24시간 미확정 세션 만료).
--   - status는 지금 'ready' 하나만 실제로 쓰인다. 'rejected'는 4단계(품질 검사)가
--     실제 SNR/무음/음성감지 로직을 붙이면서 쓰기 시작할 값 — 스키마에는 미리 허용해둔다
--     (나중에 CHECK 제약을 다시 여는 마이그레이션을 피하기 위함, 값 자체는 아직 안 씀).
--   - storage_path는 NULL 허용 — 'rejected'(특히 SPEECH_DETECTED)는 오디오 바이트 자체를
--     저장하지 않는다(docs/audio/DECISIONS.md "음성 우세 파일은 장기 저장하지 않는다").
--   - quality는 JSONB 통짜 저장 — docs/audio/API_CONTRACT.md의 quality 객체와 1:1 대응.
--     세부 필드마다 컬럼을 쪼개지 않은 이유: 이 객체는 그대로 응답에 직렬화될 뿐 SQL로
--     쿼리/필터링할 대상이 아니다(만약 나중에 quality.feedback_codes로 집계 쿼리가 필요해지면
--     그때 별도 컬럼/인덱스를 추가하는 마이그레이션을 만든다).
BEGIN;

CREATE TABLE audio_sighting (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    -- 같은 녹음의 업로드 재시도를 같은 결과로 응답하기 위한 멱등키(doc 03 3단계
    -- "client_recording_id 멱등성"). 사용자당 유일 — 다른 사용자가 우연히 같은 UUID를
    -- 보내도 충돌하지 않는다.
    client_recording_id TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('ready', 'rejected')),
    media_kind          TEXT NOT NULL DEFAULT 'audio',
    mime_type           TEXT NOT NULL,
    duration_ms         INTEGER NOT NULL CHECK (duration_ms > 0),
    sha256              TEXT NOT NULL,
    -- 변환된 mono PCM WAV의 내부 전용 불투명 참조(LocalDiskMediaStore와 같은 성격,
    -- 클라이언트는 절대 해석하지 않음). status='rejected'면 NULL(저장된 바이트 없음).
    storage_path        TEXT,
    quality             JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 미확정 세션 24시간 TTL(doc 03 5단계). 실제 정리(스윕) 작업은 이 마이그레이션의
    -- 범위 밖 — 이 인덱스는 그 작업이 나중에 붙을 때를 대비해 미리 만들어둔다.
    expires_at          TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, client_recording_id)
);
CREATE INDEX audio_sighting_expires_at_idx ON audio_sighting (expires_at);
CREATE INDEX audio_sighting_user_idx ON audio_sighting (user_id);

COMMIT;
