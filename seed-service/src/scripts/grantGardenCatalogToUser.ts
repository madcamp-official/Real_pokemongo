import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
if (!email)
  throw new Error("사용법: npm run garden:grant -- user@example.com");
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

  const beforeResult = await client.query<{
    species_owned: number;
    creature_count: number;
  }>(
    `SELECT COUNT(DISTINCT gac.taxon_id)
              FILTER (WHERE c.id IS NOT NULL)::int AS species_owned,
            COUNT(c.id)::int AS creature_count
       FROM garden_asset_catalog gac
       LEFT JOIN creature c
         ON c.user_id = $1
        AND c.taxon_id = gac.taxon_id
      WHERE gac.enabled = TRUE
        AND gac.taxon_id IS NOT NULL`,
    [user.user_id],
  );

  await client.query(
    `INSERT INTO collection_entry
       (user_id, taxon_id, unlocked, first_observed_at,
        first_observation_id, times_observed)
     SELECT $1, gac.taxon_id, TRUE, NULL, NULL, 1
       FROM garden_asset_catalog gac
      WHERE gac.enabled = TRUE
        AND gac.taxon_id IS NOT NULL
     ON CONFLICT (user_id, taxon_id) DO UPDATE SET
       unlocked = TRUE,
       times_observed = GREATEST(collection_entry.times_observed, 1)`,
    [user.user_id],
  );

  const insertedResult = await client.query<{ id: string }>(
    `INSERT INTO creature
       (id, user_id, taxon_id, nickname, origin_observation_id,
        bond, last_interaction_at, created_at)
     SELECT gen_random_uuid(), $1, gac.taxon_id, NULL, NULL, 1, NULL, now()
       FROM garden_asset_catalog gac
      WHERE gac.enabled = TRUE
        AND gac.taxon_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM creature c
           WHERE c.user_id = $1
             AND c.taxon_id = gac.taxon_id
        )
     RETURNING id`,
    [user.user_id],
  );

  const afterResult = await client.query<{
    species_owned: number;
    creature_count: number;
    unlocked_species: number;
  }>(
    `SELECT
       COUNT(DISTINCT c.taxon_id)
         FILTER (WHERE c.id IS NOT NULL)::int AS species_owned,
       COUNT(c.id)::int AS creature_count,
       COUNT(DISTINCT ce.taxon_id) FILTER (WHERE ce.unlocked)::int
         AS unlocked_species
     FROM garden_asset_catalog gac
     LEFT JOIN creature c
       ON c.user_id = $1
      AND c.taxon_id = gac.taxon_id
     LEFT JOIN collection_entry ce
       ON ce.user_id = $1
      AND ce.taxon_id = gac.taxon_id
     WHERE gac.enabled = TRUE
       AND gac.taxon_id IS NOT NULL`,
    [user.user_id],
  );
  const expectedResult = await client.query<{ species_count: number }>(
    `SELECT COUNT(DISTINCT taxon_id)::int AS species_count
       FROM garden_asset_catalog
      WHERE enabled = TRUE
        AND taxon_id IS NOT NULL`,
  );
  const expectedSpecies = expectedResult.rows[0]?.species_count ?? 0;

  if (
    afterResult.rows[0]?.species_owned !== expectedSpecies
    || afterResult.rows[0]?.unlocked_species !== expectedSpecies
  ) {
    throw new Error(
      `${expectedSpecies}종 부여 후 검증에 실패했습니다.`,
    );
  }

  await client.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        email,
        userId: user.user_id,
        nickname: user.nickname,
        before: beforeResult.rows[0],
        creaturesAdded: insertedResult.rowCount ?? 0,
        expectedSpecies,
        after: afterResult.rows[0],
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
