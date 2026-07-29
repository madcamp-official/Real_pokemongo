-- 0004_audio_stage7: 7단계(확정과 기존 기능 연동) — doc 03 10장 + docs/audio/API_CONTRACT.md §3,
-- docs/audio/STATE_MACHINE.md "identified -> confirmed".
--
-- 계약 요구사항: "같은 confirmation_id는 원본 성공 응답을 그대로 재반환(관찰/보상 재생성 없이)"
-- + "다른 confirmation_id가 이미 확정된 세션을 확정하려 하면 409". 이걸 판별하려면 (1) 어떤
-- confirmation_id로 확정됐는지, (2) 그때 실제로 뭘 응답했는지를 서버가 기억해야 한다 —
-- confirmed_observation_id(5단계가 이미 만들어둠) 하나만으로는 재생(replay) 응답을 재구성할 수
-- 없다(dex_updated/reward.xp는 "그 확정 시점"에만 참인 값이라 나중에 다시 계산하면 값이
-- 달라진다 — 예: 재조회 시점엔 이미 도감이 해금돼 있어 dex_updated를 다시 계산하면 항상
-- false가 나옴). 그래서 스냅샷 컬럼이 필요하다(candidates_json/quality_json과 같은 JSONB
-- 스냅샷 관례를 그대로 따름).
BEGIN;

-- 클레임 마커 — confirmConfirmation()의 원자적 compare-and-swap(WHERE confirmation_id IS
-- NULL)이 "동시에 들어온 서로 다른 confirmation_id 중 정확히 하나만 관찰을 만든다"를
-- 보증하는 핵심(동시 요청 3회에도 관찰 1건만 생기는 완료 기준, ACCEPTANCE.md 시나리오 7).
ALTER TABLE audio_sighting ADD COLUMN confirmation_id TEXT;

-- 원본 확정 응답 스냅샷 — {species_id, dex_updated, reward:{xp, quest_ids}}. observation_id는
-- confirmed_observation_id 컬럼에 이미 있으므로 중복 저장하지 않는다.
ALTER TABLE audio_sighting ADD COLUMN confirm_result_json JSONB;

-- status에 'confirmed' 추가(0002가 걸어둔 CHECK 제약을 다시 연다 — 그 파일 주석이 예견한
-- "값 자체는 아직 안 씀"이 지금 실제로 필요해진 케이스). 'confirmed'가 되면 STATE_MACHINE.md에
-- 따라 /audio/identify(재동정)는 더 이상 허용되지 않는다 — 기존 라우트가 이미
-- `status !== 'ready'`를 404 게이트로 쓰고 있어 이 값 추가만으로 자동으로 막힌다(코드 변경 불요).
ALTER TABLE audio_sighting DROP CONSTRAINT audio_sighting_status_check;
ALTER TABLE audio_sighting ADD CONSTRAINT audio_sighting_status_check
    CHECK (status IN ('ready', 'rejected', 'confirmed'));

COMMIT;
