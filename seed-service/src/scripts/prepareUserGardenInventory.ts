import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const desiredPlantCount = Number.parseInt(process.argv[3] ?? "10", 10);
if (!email)
  throw new Error(
    "사용법: npm run garden:prepare-user -- user@example.com [식물별수량]",
  );
if (!Number.isInteger(desiredPlantCount) || desiredPlantCount < 1)
  throw new Error("식물별 수량은 1 이상의 정수여야 합니다.");
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL이 필요합니다.");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});

await client.connect();
try {
  await client.query("BEGIN");
  const userResult = await client.query<{ user_id: string; nickname: string }>(
    `SELECT c.user_id, u.nickname
       FROM credential c
       JOIN app_user u ON u.id = c.user_id
      WHERE lower(c.email) = $1`,
    [email],
  );
  const user = userResult.rows[0];
  if (userResult.rowCount !== 1 || !user)
    throw new Error(`${email} 계정을 정확히 1개 찾지 못했습니다.`);

  const removedGulls = await client.query(
    `DELETE FROM creature_placement cp
      USING creature c, garden_asset_catalog gac
      WHERE cp.user_id = $1
        AND cp.creature_id = c.id
        AND c.user_id = $1
        AND c.taxon_id = gac.taxon_id
        AND gac.asset_key = 'black-tailed-gull'
      RETURNING cp.creature_id`,
    [user.user_id],
  );

  const insertedPlants = await client.query<{ id: string }>(
    `WITH plant_assets AS (
       SELECT DISTINCT taxon_id
         FROM garden_asset_catalog
        WHERE enabled = TRUE
          AND category = 'plant'
          AND taxon_id IS NOT NULL
     ),
     current_counts AS (
       SELECT taxon_id, COUNT(*)::int AS creature_count
         FROM creature
        WHERE user_id = $1
          AND taxon_id IN (SELECT taxon_id FROM plant_assets)
        GROUP BY taxon_id
     ),
     missing AS (
       SELECT pa.taxon_id,
              GREATEST($2 - COALESCE(cc.creature_count, 0), 0) AS missing_count
         FROM plant_assets pa
         LEFT JOIN current_counts cc ON cc.taxon_id = pa.taxon_id
     )
     INSERT INTO creature
       (id, user_id, taxon_id, nickname, origin_observation_id,
        bond, last_interaction_at, created_at)
     SELECT gen_random_uuid(), $1, missing.taxon_id, NULL, NULL, 1, NULL,
            now() + (series.ordinal * interval '1 millisecond')
       FROM missing
       CROSS JOIN LATERAL
         generate_series(1, missing.missing_count) AS series(ordinal)
     RETURNING id`,
    [user.user_id, desiredPlantCount],
  );

  await client.query(
    `UPDATE collection_entry ce
        SET unlocked = TRUE,
            times_observed = GREATEST(ce.times_observed, $2)
       FROM garden_asset_catalog gac
      WHERE ce.user_id = $1
        AND ce.taxon_id = gac.taxon_id
        AND gac.enabled = TRUE
        AND gac.category = 'plant'`,
    [user.user_id, desiredPlantCount],
  );

  const verification = await client.query<{
    plant_species: number;
    minimum_per_species: number;
    maximum_per_species: number;
    total_plants: number;
    placed_gulls: number;
  }>(
    `WITH plant_counts AS (
       SELECT gac.taxon_id, COUNT(c.id)::int AS owned
         FROM garden_asset_catalog gac
         LEFT JOIN creature c
           ON c.user_id = $1
          AND c.taxon_id = gac.taxon_id
        WHERE gac.enabled = TRUE
          AND gac.category = 'plant'
          AND gac.taxon_id IS NOT NULL
        GROUP BY gac.taxon_id
     )
     SELECT
       COUNT(*)::int AS plant_species,
       MIN(owned)::int AS minimum_per_species,
       MAX(owned)::int AS maximum_per_species,
       SUM(owned)::int AS total_plants,
       (
         SELECT COUNT(*)::int
           FROM creature_placement cp
           JOIN creature c ON c.id = cp.creature_id
           JOIN garden_asset_catalog gac ON gac.taxon_id = c.taxon_id
          WHERE cp.user_id = $1
            AND gac.asset_key = 'black-tailed-gull'
       ) AS placed_gulls
     FROM plant_counts`,
    [user.user_id],
  );
  const result = verification.rows[0];
  if (
    !result
    || result.plant_species !== 15
    || result.minimum_per_species !== desiredPlantCount
    || result.placed_gulls !== 0
  ) {
    throw new Error("식물 지급 또는 괭이갈매기 회수 검증에 실패했습니다.");
  }

  await client.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        email,
        userId: user.user_id,
        nickname: user.nickname,
        desiredPlantCount,
        plantCreaturesAdded: insertedPlants.rowCount ?? 0,
        gullPlacementsRemoved: removedGulls.rowCount ?? 0,
        verification: result,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
