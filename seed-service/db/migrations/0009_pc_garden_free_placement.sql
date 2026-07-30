BEGIN;

ALTER TABLE creature_placement
    ADD COLUMN placement_mode TEXT NOT NULL DEFAULT 'slot',
    ADD COLUMN world_x REAL,
    ADD COLUMN world_y REAL,
    ADD COLUMN world_z REAL;

ALTER TABLE creature_placement
    DROP CONSTRAINT creature_placement_pkey,
    ALTER COLUMN "row" DROP NOT NULL,
    ALTER COLUMN col DROP NOT NULL;

ALTER TABLE creature_placement
    ADD CONSTRAINT creature_placement_mode_check
        CHECK (placement_mode IN ('slot', 'free')),
    ADD CONSTRAINT creature_placement_position_check
        CHECK (
            (
                placement_mode = 'slot'
                AND "row" IS NOT NULL
                AND col IS NOT NULL
                AND world_x IS NULL
                AND world_y IS NULL
                AND world_z IS NULL
            )
            OR
            (
                placement_mode = 'free'
                AND "row" IS NULL
                AND col IS NULL
                AND world_x IS NOT NULL
                AND world_y IS NOT NULL
                AND world_z IS NOT NULL
            )
        ) NOT VALID;

CREATE UNIQUE INDEX creature_placement_slot_unique
    ON creature_placement (user_id, "row", col)
    WHERE placement_mode = 'slot';

-- 기존 동물·곤충·새 배치는 현재 화면 위치를 그대로 자유 배치 좌표로 변환한다.
WITH movable AS (
    SELECT cp.creature_id,
           cp."row" AS old_row,
           cp.col AS old_col,
           CASE
               WHEN cp."row" < 6 THEN
                   (ARRAY[-18.0, -12.5, -7.0, 7.0, 12.5, 18.0])[cp.col + 1]
               WHEN cp."row" = 6 THEN
                   (ARRAY[-35.0, -30.0, -7.0, 7.0, 30.0, 35.0])[cp.col + 1]
               ELSE 0.0
           END::REAL AS x,
           CASE
               WHEN cp."row" < 6 THEN (16.5 + cp."row" * 2.6)
               WHEN cp."row" = 6 THEN
                   (ARRAY[8.0, 12.0, 9.0, 9.0, 12.0, 8.0])[cp.col + 1]
               ELSE 16.5
           END::REAL AS z
      FROM creature_placement cp
      JOIN creature c ON c.id = cp.creature_id
      JOIN garden_asset_catalog gac ON gac.taxon_id = c.taxon_id
     WHERE gac.category NOT IN ('plant', 'tree')
)
UPDATE creature_placement cp
   SET placement_mode = 'free',
       world_x = movable.x,
       world_y = 3.9,
       world_z = movable.z,
       "row" = NULL,
       col = NULL
  FROM movable
 WHERE cp.creature_id = movable.creature_id;

ALTER TABLE creature_placement
    VALIDATE CONSTRAINT creature_placement_position_check;

-- 좌우 돔과 중앙 열린 면의 추가 식물 슬롯 12칸.
INSERT INTO garden_tile (user_id, "row", col, type)
SELECT users.user_id,
       rows.row,
       cols.col,
       CASE
           WHEN cols.col = 2 THEN 'soil'::tile_type
           WHEN cols.col = 5 THEN 'flower_bed'::tile_type
           ELSE 'grass'::tile_type
       END
  FROM (SELECT DISTINCT user_id FROM garden_tile) AS users
 CROSS JOIN (VALUES (7), (8)) AS rows(row)
 CROSS JOIN (VALUES (0), (1), (2), (3), (4), (5)) AS cols(col)
ON CONFLICT (user_id, "row", col) DO NOTHING;

COMMIT;
