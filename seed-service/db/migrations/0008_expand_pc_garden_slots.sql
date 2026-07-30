-- PC 홈가든 드래그 배치를 위한 7번째 행(6칸) 추가.
-- 기존 6×6 사용자의 배치와 타일 종류는 유지하고 빈 슬롯만 확장한다.
INSERT INTO garden_tile (user_id, "row", col, type)
SELECT users.user_id, 6, cols.col, cols.type::tile_type
  FROM (
    SELECT DISTINCT user_id
      FROM garden_tile
  ) AS users
 CROSS JOIN (
    VALUES
      (0, 'grass'),
      (1, 'grass'),
      (2, 'soil'),
      (3, 'grass'),
      (4, 'grass'),
      (5, 'flower_bed')
  ) AS cols(col, type)
ON CONFLICT (user_id, "row", col) DO NOTHING;
