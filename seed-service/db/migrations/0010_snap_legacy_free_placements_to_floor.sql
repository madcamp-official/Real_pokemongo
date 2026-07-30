BEGIN;

-- 0009에서 기존 슬롯 배치를 자유 좌표로 옮길 때 중앙 돔 뒤쪽의
-- 좁아지는 바닥 밖에 있던 네 모서리 좌표를 실제 바닥 안으로 당긴다.
UPDATE creature_placement
SET world_x = CASE WHEN world_x < 0 THEN -16 ELSE 16 END
WHERE placement_mode = 'free'
  AND ABS(ABS(world_x) - 18) < 0.01
  AND ABS(world_z - 26.9) < 0.01;

UPDATE creature_placement
SET world_x = CASE WHEN world_x < 0 THEN -16 ELSE 16 END,
    world_z = 28
WHERE placement_mode = 'free'
  AND ABS(ABS(world_x) - 18) < 0.01
  AND ABS(world_z - 29.5) < 0.01;

COMMIT;
