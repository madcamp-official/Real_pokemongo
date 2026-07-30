-- 0011_audio_sighting_coord: 소리 동정으로 확정된 관찰이 탐험 지도에 뜨지 않는 문제 수정.
--
-- 0002_audio_sighting.sql이 당시(3단계) lat/lng을 "파싱만 하고 저장 컬럼 없이 버린다"고
-- 명시적으로 미뤄뒀는데(API_CONTRACT.md에는 이미 정의돼 있었음), /audio/identify/confirm이
-- rawCoord 없이 recordIdentification을 호출해 observation.precise_lat/lng이 항상 NULL이
-- 됐고, /map/pins가 preciseCoord 없는 관찰을 걸러내 소리로 등록한 종이 지도에서 빠졌다.
--
-- 사진 파이프라인처럼 위치는 선택 사항이라 NULL 허용(명세서: "위치는 선택 사항이며...
-- 녹음/동정/유사도 채점에 필요하지 않다"). 이미 있는 행은 전부 NULL로 시작 —
-- 이 마이그레이션 이전에 확정된 소리 관찰은 좌표가 없었으므로 지어낼 수 없다.
BEGIN;

-- 병합 전 브랜치에서 같은 변경이 0006 이름으로 적용된 DB도 안전하게 통과한다.
ALTER TABLE audio_sighting ADD COLUMN IF NOT EXISTS precise_lat DOUBLE PRECISION;
ALTER TABLE audio_sighting ADD COLUMN IF NOT EXISTS precise_lng DOUBLE PRECISION;

COMMIT;
