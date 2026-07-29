-- 0003_audio_stage5: 5단계(DB와 임시 세션) — doc 03 8장 + docs/audio/DATA_CONTRACT.md.
--
-- 이 마이그레이션 시점에 audio_sighting은 0행(0002 이후 실 서비스 트래픽 없음, 코드는
-- InMemory/임시 Postgres로만 테스트됨) — 확인 후 진행. observation은 49행, observation_media는
-- 49행 실데이터가 있다 — 이쪽은 기존 행을 절대 건드리지 않고 안전한 기본값으로만 확장한다
-- (마이그레이션 안전: "기존 사진 레코드를 변경하지 않는다", "기존 쿼리가 modality 추가 후에도
-- 동작해야 한다").
--
-- 범위 결정(정직하게 기록):
--   - audio_identification_result/species_sound_reference는 스키마만 만든다. 리포지토리
--     포트/구현/도메인 타입은 만들지 않는다 — 0002가 남긴 이유와 동일: 아직 이 테이블에 값을
--     쓸 코드(6단계 동정 API, 8단계 참조 음원)가 없어서, 지금 리포지토리까지 만들면 "아무도
--     안 부르는 코드"가 먼저 생겨 코드와 실제 쓰임이 어긋난다.
--   - observation_media의 새 컬럼(media_kind 등)도 스키마만 확장한다. 오디오 확정 관찰(7단계)이
--     실제로 이 컬럼들을 채우는 코드는 아직 없다 — MediaRef가 지금은 불투명 문자열이라
--     (mediaKind 등을 실어 나를 자리가 domain 타입에 아직 없음) 이 컬럼들에 실제 값을 쓰려면
--     7단계에서 그 타입 자체를 넓혀야 한다.
--   - audio_sighting.original_media_ref는 항상 NULL로 둔다(코드가 채우지 않음) — 3단계부터의
--     의도적 설계(AudioConverter.ts 주석): 원본 업로드 바이트는 애초에 임시 파일에조차 남기지
--     않고 변환 직후 지운다("원본 폐기 정책", 사진 파이프라인의 확정 시 원본 폐기와 같은 철학).
--     DATA_CONTRACT.md가 이 필드를 나열하지만, 우리는 원본을 아예 안 만들므로 채울 값 자체가
--     없다 — 컬럼은 계약 완전성을 위해 존재하되 항상 NULL.
BEGIN;

-- =============================================================================
-- 1) observation.modality — 기존 관찰 확장
-- =============================================================================
CREATE TYPE observation_modality AS ENUM ('photo', 'audio');
ALTER TABLE observation
    ADD COLUMN modality observation_modality NOT NULL DEFAULT 'photo';
-- DEFAULT가 기존 49행에 즉시 적용되므로 "기존 관찰은 전부 photo로 해석된다"(완료 기준)를
-- 마이그레이션 자체가 보장한다 — 별도 UPDATE 문 불필요.

-- =============================================================================
-- 2) observation_media — 미디어 메타데이터 확장(DATA_CONTRACT.md "Media metadata extension")
-- =============================================================================
CREATE TYPE media_kind AS ENUM ('image', 'audio');
ALTER TABLE observation_media ADD COLUMN media_kind media_kind NOT NULL DEFAULT 'image';
ALTER TABLE observation_media ADD COLUMN mime_type TEXT;              -- 기존 행은 몰라서 NULL(재계산 안 함)
ALTER TABLE observation_media ADD COLUMN duration_ms INTEGER;         -- 사진에는 의미 없음, 오디오만
ALTER TABLE observation_media ADD COLUMN sha256 TEXT;                 -- 기존 행은 몰라서 NULL(재계산 안 함)
ALTER TABLE observation_media
    ADD COLUMN retention_class TEXT NOT NULL DEFAULT 'permanent'
    CHECK (retention_class IN ('permanent', 'temporary', 'reference'));
-- 'permanent'는 DATA_CONTRACT.md의 문서화된 2값(temporary/reference)에 없는 3번째 값이다 —
-- 그 문서는 오디오 관점에서만 쓰여서 "확정된 사진처럼 TTL 없이 영구 보관되는 미디어"를 부를
-- 이름이 없다(오디오는 확정돼도 24시간 뒤 지워지므로 'temporary'만 쓰면 됨). 기존 49건
-- 전부가 바로 이 경우라 안전한 기본값으로 확정.
ALTER TABLE observation_media ADD COLUMN derived_from_media_id TEXT;  -- media_ref와 같은 성격의
-- 비FK 문자열 참조(observation_media엔 단일 컬럼 PK가 없어 강제 FK를 걸 대상이 없음 — media_ref
-- 자체도 원래 FK가 아니라 불투명 참조라는 기존 관례를 그대로 따름).

-- =============================================================================
-- 3) audio_sighting 확장 — DATA_CONTRACT.md "audio_sighting" 필드 중 0002가 빠뜨린 것
-- =============================================================================
-- 0행이라 기본값 없이 NOT NULL로 추가 가능(백필 대상 자체가 없음).
ALTER TABLE audio_sighting ADD COLUMN recorded_at TIMESTAMPTZ NOT NULL;
-- 한 세션 확정 1회를 DB 레벨에서도 보증하는 자리(7단계가 채운다) — NULL이면 미확정.
ALTER TABLE audio_sighting
    ADD COLUMN confirmed_observation_id UUID REFERENCES observation(id) ON DELETE SET NULL;
-- 이 파일 상단 주석 참고 — 항상 NULL(원본을 안 만드는 설계라 채울 값이 없음).
ALTER TABLE audio_sighting ADD COLUMN original_media_ref TEXT;

-- =============================================================================
-- 4) 신규 테이블(스키마만) — DATA_CONTRACT.md 그대로. 리포지토리는 6/8단계에서.
-- =============================================================================
-- 세션당 최신 동정 스냅샷 1건(재동정 시 갱신 — "Unique sighting reference"라 이력이 아니라
-- 현재값 1건, PK가 곧 audio_sighting_id).
CREATE TABLE audio_identification_result (
    audio_sighting_id   UUID PRIMARY KEY REFERENCES audio_sighting(id) ON DELETE CASCADE,
    candidates_json     JSONB       NOT NULL,  -- 확정(confirm) 검증에 쓰이는 후보 스냅샷
    model_provider      TEXT        NOT NULL,  -- 예: 'birdnet'
    model_version       TEXT        NOT NULL,  -- 불변 버전 문자열
    location_prior_used BOOLEAN     NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 종별 라이선스 참조 음원 메타데이터(8단계 — research/audio-reference-pool/clips.csv의
-- 사람이 승인한 값이 결국 이 테이블로 들어올 대상). id는 taxon/quest와 같은 슬러그 PK 관례
-- (research 데이터의 실제 clip id 형식과도 일치, 예: 'ref-hypsipetes-001').
CREATE TABLE species_sound_reference (
    id                     TEXT PRIMARY KEY,
    taxon_id               TEXT NOT NULL REFERENCES taxon(id) ON DELETE RESTRICT,
    media_ref              TEXT NOT NULL,
    call_type              TEXT NOT NULL,          -- 예: 'song', 'call', 'alarm'
    source_url             TEXT NOT NULL,
    creator                TEXT NOT NULL,
    license                TEXT NOT NULL,
    attribution            TEXT NOT NULL,
    quality_status         TEXT NOT NULL DEFAULT 'pending'
        CHECK (quality_status IN ('pending', 'approved', 'rejected')),
    reference_set_version  TEXT NOT NULL,
    embedding_ref          TEXT,                    -- 임베딩 계산 전에는 NULL
    embedding_model_version TEXT
);
CREATE INDEX species_sound_reference_taxon_idx ON species_sound_reference (taxon_id);

COMMIT;
