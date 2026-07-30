BEGIN;

-- 같은 종을 다시 관찰할 때마다 별도의 정원 개체를 보유할 수 있게 한다.
ALTER TABLE creature
  DROP CONSTRAINT IF EXISTS creature_user_id_taxon_id_key;

CREATE INDEX IF NOT EXISTS creature_user_taxon_idx
  ON creature (user_id, taxon_id);

-- 한 관찰이 재처리되어 동일 개체가 중복 생성되는 것은 막는다.
CREATE UNIQUE INDEX IF NOT EXISTS creature_origin_observation_unique_idx
  ON creature (origin_observation_id)
  WHERE origin_observation_id IS NOT NULL;

CREATE TABLE garden_asset_catalog (
  asset_key          TEXT PRIMARY KEY,
  taxon_id           TEXT REFERENCES taxon(id) ON DELETE SET NULL,
  display_name       TEXT NOT NULL,
  category           TEXT NOT NULL
                     CHECK (category IN ('tree','plant','insect','bird','animal')),
  resource_path      TEXT NOT NULL UNIQUE,
  behaviour_profile TEXT NOT NULL,
  display_scale      REAL NOT NULL CHECK (display_scale > 0),
  minimum_altitude   REAL NOT NULL DEFAULT 0,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX garden_asset_catalog_taxon_idx
  ON garden_asset_catalog (taxon_id)
  WHERE taxon_id IS NOT NULL;

COMMIT;
