BEGIN;

-- 0006 이전에는 같은 종을 여러 번 관찰해도 첫 개체 한 마리만 생성됐다.
-- 기존 collection_entry.times_observed와 실제 creature 수의 차이만큼 개체를 보충한다.
WITH current_counts AS (
  SELECT user_id, taxon_id, count(*)::integer AS creature_count
  FROM creature
  GROUP BY user_id, taxon_id
),
missing AS (
  SELECT
    ce.user_id,
    ce.taxon_id,
    ce.first_observed_at,
    GREATEST(ce.times_observed - COALESCE(cc.creature_count, 0), 0) AS missing_count
  FROM collection_entry ce
  LEFT JOIN current_counts cc
    ON cc.user_id = ce.user_id
   AND cc.taxon_id = ce.taxon_id
  WHERE ce.unlocked = TRUE
)
INSERT INTO creature (
  id,
  user_id,
  taxon_id,
  nickname,
  origin_observation_id,
  bond,
  last_interaction_at,
  created_at
)
SELECT
  gen_random_uuid(),
  missing.user_id,
  missing.taxon_id,
  NULL,
  NULL,
  1,
  NULL,
  COALESCE(missing.first_observed_at, now())
    + (series.ordinal * interval '1 second')
FROM missing
CROSS JOIN LATERAL generate_series(1, missing.missing_count) AS series(ordinal);

COMMIT;
