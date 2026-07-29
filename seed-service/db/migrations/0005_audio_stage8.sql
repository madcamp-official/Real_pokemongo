-- 0005_audio_stage8: 8단계(참조 음원과 유사도) — doc 03 11장 + docs/audio/DATA_CONTRACT.md
-- "species_sound_reference".
--
-- 이 시점에 species_sound_reference는 0행이다(5단계가 스키마만 만들었고, 사람 검수가 아직
-- 하나도 안 끝나 실제로 INSERT하는 코드/데이터가 없었음 — research/audio-reference-pool/
-- clips.csv의 1236개 후보 전부 quality_status=pending). 0행이라 NOT NULL을 기본값 없이
-- 바로 추가해도 안전하다(백필 대상 자체가 없음).
--
-- duration_ms를 추가하는 이유: DATA_CONTRACT.md의 species_sound_reference 필드 목록엔 없지만,
-- API_CONTRACT.md §5 GET /species/:species_id/sounds 응답의 clips[].duration_ms를 정직하게
-- 채우려면 저장할 곳이 필요하다(지어낼 수 없음) — 5단계의 observation_media.retention_class
-- 'permanent' 추가와 같은 성격의, 문서화된 최소 목록을 넘는 정당한 확장.
BEGIN;

ALTER TABLE species_sound_reference ADD COLUMN duration_ms INTEGER NOT NULL;

COMMIT;
