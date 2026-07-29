-- 0001_baseline: 증분 마이그레이션 추적 인프라 도입.
--
-- 왜: db/schema.sql은 BEGIN/COMMIT 한 번짜리 스크립트라(CREATE TABLE에 IF NOT EXISTS도
-- 없음), 이미 실데이터가 있는 공유 DB에 재실행하면 그대로 실패한다. 이 파일부터는
-- "무엇을 이미 적용했는지"를 DB 스스로 기억하게 만들어, 앞으로의 모든 스키마 변경(예:
-- 오디오 기능의 observation.modality 컬럼, audio_sighting 등 신규 테이블)을 작고 순서
-- 있는 파일 단위로 안전하게 누적 적용한다.
--
-- 이 파일은 schema.sql이 정의하는 기존 테이블(observation, quest 등)을 다시 만들지
-- 않는다 — 그건 이미 라이브 DB에 있다고 전제한다(실제로 있음, 2026-07-28 기준 운영 중인
-- GPU 서버 Postgres에서 확인됨). 오직 추적 테이블만 새로 만든다.
--
-- 이후 규칙:
--   1) 새 변경은 이 폴더에 "NNNN_설명.sql"로 추가한다(번호는 4자리, 앞자리 0 채움).
--   2) 각 파일은 자기 자신의 BEGIN/COMMIT을 포함한다(schema.sql 관례를 그대로 따름).
--   3) db/schema.sql은 이제 "완전히 새 DB를 처음부터 세팅할 때"의 스냅샷 참고 문서로만
--      쓴다 — src/db/migrate.ts가 더 이상 그 파일을 실행하지 않는다.
--   4) 실행: npm run db:migrate (아직 적용 안 된 파일만 순서대로 적용, 이미 적용된 건 건너뜀).

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,        -- 파일명에서 .sql을 뺀 것, 예: '0001_baseline'
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
