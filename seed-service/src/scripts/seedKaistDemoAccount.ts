import { randomUUID } from "node:crypto";
import pg from "pg";

const DEMO_SOURCE = "demo-seed-kaist-v1";
const DEMO_LOCATION_SOURCE = "demo-current-location-kaist-v1";
const REGION_CODE = "30200";
const REGION_LABEL = "대전 유성구 · KAIST 본원";
const LARGE_BILLED_CROW_ASSET_KEY = "large-billed-crow";
const EXCLUDED_ASSET_KEYS = [
  LARGE_BILLED_CROW_ASSET_KEY,
  "rhinoceros-beetle",
  "stag-beetle",
];

const email = process.argv[2]?.trim().toLowerCase();
const apply = process.argv.includes("--apply");

if (!email) {
  throw new Error(
    "사용법: tsx --env-file=.env src/scripts/seedKaistDemoAccount.ts user@example.com [--apply]",
  );
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL이 필요합니다.");
}

type AssetRow = {
  asset_key: string;
  taxon_id: string;
  display_name: string;
  category: "tree" | "insect" | "bird";
  behaviour_profile: string;
};

type SeedTarget = AssetRow & {
  quantity: number;
  demo_group: "tree" | "butterfly" | "insect" | "bird";
};

// 앱 지도에서 "현재 위치"로 쓰일 KAIST 중앙 지점. 앱의 탐험 구역 반경은 300m다.
// 실기기 GPS가 이 기준점과 조금 달라도 대부분 원 안에 남도록 핀은 훨씬 안쪽인
// 55m/115m/185m 세 겹의 원형 범위에 고르게 분산한다.
const KAIST_CENTER = {
  name: "KAIST 중앙 탐험 지점",
  lat: 36.37110,
  lng: 127.36220,
} as const;

const OTHER_INSECT_KEYS = [
  "dragonfly",
  "honeybee",
  "hornet",
  "ladybug",
];

const BIRD_KEYS = [
  "daurian-redstart",
  "oriental-turtle-dove",
  "white-wagtail",
  "brown-eared-bulbul",
  "mallard",
  "grey-heron-rigged",
];

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
  if (userResult.rowCount !== 1 || !user) {
    throw new Error(`${email} 계정을 정확히 1개 찾지 못했습니다.`);
  }

  const assetResult = await client.query<AssetRow>(
    `SELECT asset_key, taxon_id, display_name, category, behaviour_profile
       FROM garden_asset_catalog
      WHERE enabled = TRUE
        AND taxon_id IS NOT NULL
        AND category IN ('tree', 'insect', 'bird')
      ORDER BY category, display_name`,
  );

  const trees = assetResult.rows
    .filter((asset) => asset.category === "tree")
    .map((asset) => ({ ...asset, quantity: 3, demo_group: "tree" as const }));
  const butterflies = assetResult.rows
    .filter((asset) => asset.behaviour_profile === "butterfly-flight")
    .map((asset) => ({
      ...asset,
      quantity: 1,
      demo_group: "butterfly" as const,
    }));
  const otherInsects = selectAssets(
    assetResult.rows,
    OTHER_INSECT_KEYS,
    "insect",
  );
  const birds = selectAssets(assetResult.rows, BIRD_KEYS, "bird");
  const targets: SeedTarget[] = [
    ...trees,
    ...butterflies,
    ...otherInsects,
    ...birds,
  ];

  if (trees.length === 0) {
    throw new Error("활성화된 나무 3D 자산을 찾지 못했습니다.");
  }

  const crow = assetResult.rows.find(
    (asset) => asset.asset_key === LARGE_BILLED_CROW_ASSET_KEY,
  );
  if (!crow) {
    throw new Error("큰부리까마귀 카탈로그 연결을 찾지 못했습니다.");
  }
  if (targets.some((target) => target.taxon_id === crow.taxon_id)) {
    throw new Error("시연 대상에 큰부리까마귀가 포함됐습니다.");
  }

  const beforeResult = await client.query<{
    observations: number;
    creatures: number;
    unlocked_species: number;
    crow_observations: number;
    crow_creatures: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM observation WHERE user_id = $1) AS observations,
       (SELECT COUNT(*)::int FROM creature WHERE user_id = $1) AS creatures,
       (SELECT COUNT(*)::int FROM collection_entry
         WHERE user_id = $1 AND unlocked) AS unlocked_species,
       (SELECT COUNT(*)::int FROM observation
         WHERE user_id = $1 AND taxon_id = $2) AS crow_observations,
       (SELECT COUNT(*)::int FROM creature
         WHERE user_id = $1 AND taxon_id = $2) AS crow_creatures`,
    [user.user_id, crow.taxon_id],
  );

  const excludedAssets = EXCLUDED_ASSET_KEYS.map((key) => {
    const asset = assetResult.rows.find((candidate) => candidate.asset_key === key);
    if (!asset) {
      throw new Error(`제외할 3D 자산을 찾지 못했습니다: ${key}`);
    }
    return asset;
  });
  const excludedTaxonIds = excludedAssets.map((asset) => asset.taxon_id);

  const removedExcludedCreatures = await client.query(
    `DELETE FROM creature
      WHERE user_id = $1 AND taxon_id = ANY($2::text[])
      RETURNING id`,
    [user.user_id, excludedTaxonIds],
  );
  const removedExcludedObservations = await client.query(
    `DELETE FROM observation
      WHERE user_id = $1 AND taxon_id = ANY($2::text[])
      RETURNING id`,
    [user.user_id, excludedTaxonIds],
  );
  await client.query(
    `DELETE FROM collection_entry
      WHERE user_id = $1 AND taxon_id = ANY($2::text[])`,
    [user.user_id, excludedTaxonIds],
  );

  let createdObservations = 0;
  let createdCreatures = 0;

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex]!;
    const seededObservationIds: string[] = [];

    for (let ordinal = 1; ordinal <= target.quantity; ordinal += 1) {
      const noteKey = `${target.asset_key}:${ordinal}`;
      const point = pointForObservation(
        targetIndex,
        targets.length,
        ordinal,
      );
      const observedAt = new Date(
        Date.now() - (targets.length - targetIndex) * 3 * 60 * 60 * 1000
          - ordinal * 60 * 1000,
      );
      const existingObservation = await client.query<{ id: string }>(
        `SELECT id
           FROM observation
          WHERE user_id = $1
            AND taxon_id = $2
            AND source = $3
            AND note = $4
          LIMIT 1`,
        [user.user_id, target.taxon_id, DEMO_SOURCE, noteKey],
      );

      let observationId = existingObservation.rows[0]?.id;
      if (!observationId) {
        observationId = randomUUID();

        await client.query(
          `INSERT INTO observation
             (id, user_id, taxon_id, taxon_rank, observed_at, modality,
              region_code, region_label, precise_lat, precise_lng,
              confidence, source, note)
           VALUES ($1, $2, $3, 'species', $4, 'photo',
                   $5, $6, $7, $8, 0.96, $9, $10)`,
          [
            observationId,
            user.user_id,
            target.taxon_id,
            observedAt,
            REGION_CODE,
            `${REGION_LABEL} · 현재 위치 주변 ${targetIndex + 1}`,
            point.lat,
            point.lng,
            DEMO_SOURCE,
            noteKey,
          ],
        );
        createdObservations += 1;
      } else {
        await client.query(
          `UPDATE observation
              SET observed_at = $3,
                  region_code = $4,
                  region_label = $5,
                  precise_lat = $6,
                  precise_lng = $7
            WHERE id = $1 AND user_id = $2`,
          [
            observationId,
            user.user_id,
            observedAt,
            REGION_CODE,
            `${REGION_LABEL} · 현재 위치 주변 ${targetIndex + 1}`,
            point.lat,
            point.lng,
          ],
        );
      }
      seededObservationIds.push(observationId);

      const existingCreature = await client.query<{ id: string }>(
        `SELECT id
           FROM creature
          WHERE user_id = $1 AND origin_observation_id = $2
          LIMIT 1`,
        [user.user_id, observationId],
      );
      if (existingCreature.rowCount === 0) {
        await client.query(
          `INSERT INTO creature
             (id, user_id, taxon_id, nickname, origin_observation_id,
              bond, last_interaction_at, created_at)
           VALUES ($1, $2, $3, NULL, $4, 1, NULL, now())`,
          [randomUUID(), user.user_id, target.taxon_id, observationId],
        );
        createdCreatures += 1;
      }
    }

    const observationStats = await client.query<{
      first_observed_at: Date;
      times_observed: number;
    }>(
      `SELECT MIN(observed_at) AS first_observed_at,
              COUNT(*)::int AS times_observed
         FROM observation
        WHERE user_id = $1 AND taxon_id = $2`,
      [user.user_id, target.taxon_id],
    );
    const stats = observationStats.rows[0]!;

    await client.query(
      `INSERT INTO collection_entry
         (user_id, taxon_id, unlocked, first_observed_at,
          first_observation_id, times_observed)
       VALUES ($1, $2, TRUE, $3, $4, $5)
       ON CONFLICT (user_id, taxon_id) DO UPDATE SET
         unlocked = TRUE,
         first_observed_at = EXCLUDED.first_observed_at,
         first_observation_id = EXCLUDED.first_observation_id,
         times_observed = EXCLUDED.times_observed`,
      [
        user.user_id,
        target.taxon_id,
        stats.first_observed_at,
        seededObservationIds[0],
        stats.times_observed,
      ],
    );
  }

  const currentLocationResult = await client.query<{ id: string }>(
    `SELECT id
       FROM observation
      WHERE user_id = $1 AND source = $2
      LIMIT 1`,
    [user.user_id, DEMO_LOCATION_SOURCE],
  );
  const currentLocationId = currentLocationResult.rows[0]?.id ?? randomUUID();
  await client.query(
    `INSERT INTO observation
       (id, user_id, taxon_id, taxon_rank, observed_at, modality,
        region_code, region_label, precise_lat, precise_lng,
        confidence, source, note)
     VALUES ($1, $2, NULL, NULL, now(), 'photo',
             $3, $4, $5, $6, 1, $7, 'KAIST 시연 현재 위치')
     ON CONFLICT (id) DO UPDATE SET
       observed_at = now(),
       region_code = EXCLUDED.region_code,
       region_label = EXCLUDED.region_label,
       precise_lat = EXCLUDED.precise_lat,
       precise_lng = EXCLUDED.precise_lng`,
    [
      currentLocationId,
      user.user_id,
      REGION_CODE,
      `${REGION_LABEL} · ${KAIST_CENTER.name}`,
      KAIST_CENTER.lat,
      KAIST_CENTER.lng,
      DEMO_LOCATION_SOURCE,
    ],
  );

  const verificationResult = await client.query<{
    demo_group: string;
    species_count: number;
    observation_count: number;
    creature_count: number;
  }>(
    `WITH targets(taxon_id, demo_group) AS (
       SELECT *
         FROM unnest($2::text[], $3::text[])
     )
     SELECT targets.demo_group,
            COUNT(DISTINCT targets.taxon_id)::int AS species_count,
            COUNT(DISTINCT o.id)::int AS observation_count,
            COUNT(DISTINCT c.id)::int AS creature_count
       FROM targets
       LEFT JOIN observation o
         ON o.user_id = $1
        AND o.taxon_id = targets.taxon_id
        AND o.source = $4
       LEFT JOIN creature c
         ON c.user_id = $1
        AND c.origin_observation_id = o.id
      GROUP BY targets.demo_group
      ORDER BY targets.demo_group`,
    [
      user.user_id,
      targets.map((target) => target.taxon_id),
      targets.map((target) => target.demo_group),
      DEMO_SOURCE,
    ],
  );

  const crowVerification = await client.query<{
    observations: number;
    creatures: number;
    collection_entries: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM observation
         WHERE user_id = $1 AND taxon_id = $2) AS observations,
       (SELECT COUNT(*)::int FROM creature
         WHERE user_id = $1 AND taxon_id = $2) AS creatures,
       (SELECT COUNT(*)::int FROM collection_entry
         WHERE user_id = $1 AND taxon_id = $2) AS collection_entries`,
    [user.user_id, crow.taxon_id],
  );
  const crowAfter = crowVerification.rows[0]!;
  if (
    crowAfter.observations !== 0
    || crowAfter.creatures !== 0
    || crowAfter.collection_entries !== 0
  ) {
    throw new Error("큰부리까마귀 제외 검증에 실패했습니다.");
  }

  const excludedVerification = await client.query<{
    observations: number;
    creatures: number;
    collection_entries: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM observation
         WHERE user_id = $1 AND taxon_id = ANY($2::text[])) AS observations,
       (SELECT COUNT(*)::int FROM creature
         WHERE user_id = $1 AND taxon_id = ANY($2::text[])) AS creatures,
       (SELECT COUNT(*)::int FROM collection_entry
         WHERE user_id = $1 AND taxon_id = ANY($2::text[])) AS collection_entries`,
    [user.user_id, excludedTaxonIds],
  );
  const excludedAfter = excludedVerification.rows[0]!;
  if (
    excludedAfter.observations !== 0
    || excludedAfter.creatures !== 0
    || excludedAfter.collection_entries !== 0
  ) {
    throw new Error("제외 종 정리 검증에 실패했습니다.");
  }

  const pinVerification = await client.query<{
    pin_count: number;
    unique_coordinate_count: number;
    minimum_distance_from_center_m: number;
    maximum_distance_from_center_m: number;
  }>(
    `SELECT
       COUNT(*)::int AS pin_count,
       COUNT(DISTINCT (
         ROUND(o.precise_lat::numeric, 7),
         ROUND(o.precise_lng::numeric, 7)
       ))::int AS unique_coordinate_count,
       ROUND(MIN(
         111320 * sqrt(
           power(o.precise_lat - $3, 2)
           + power((o.precise_lng - $4) * cos(radians($3)), 2)
         )
       ))::int AS minimum_distance_from_center_m,
       ROUND(MAX(
         111320 * sqrt(
           power(o.precise_lat - $3, 2)
           + power((o.precise_lng - $4) * cos(radians($3)), 2)
         )
       ))::int AS maximum_distance_from_center_m
      FROM collection_entry ce
      JOIN observation o ON o.id = ce.first_observation_id
     WHERE ce.user_id = $1
       AND ce.taxon_id = ANY($2::text[])
       AND ce.unlocked`,
    [
      user.user_id,
      targets.map((target) => target.taxon_id),
      KAIST_CENTER.lat,
      KAIST_CENTER.lng,
    ],
  );
  const pinDistribution = pinVerification.rows[0]!;
  if (
    pinDistribution.pin_count !== targets.length
    || pinDistribution.unique_coordinate_count !== targets.length
  ) {
    throw new Error("종 핀 중복 방지 검증에 실패했습니다.");
  }

  const expectedTreeObservations = trees.length * 3;
  const treeVerification = verificationResult.rows.find(
    (row) => row.demo_group === "tree",
  );
  if (
    treeVerification?.observation_count !== expectedTreeObservations
    || treeVerification.creature_count !== expectedTreeObservations
  ) {
    throw new Error("나무 종별 3개체 지급 검증에 실패했습니다.");
  }

  const output = {
    mode: apply ? "apply" : "dry-run",
    email,
    userId: user.user_id,
    nickname: user.nickname,
    before: beforeResult.rows[0],
    plan: {
      trees: { species: trees.length, each: 3, creatures: trees.length * 3 },
      butterflies: { species: butterflies.length, each: 1 },
      insects: { species: otherInsects.length, each: 1 },
      birds: { species: birds.length, each: 1 },
      totalSpecies: targets.length,
      totalDemoCreatures: targets.reduce(
        (sum, target) => sum + target.quantity,
        0,
      ),
    },
    changes: {
      createdObservations,
      createdCreatures,
      removedExcludedObservations: removedExcludedObservations.rowCount ?? 0,
      removedExcludedCreatures: removedExcludedCreatures.rowCount ?? 0,
    },
    verification: verificationResult.rows,
    crowAfter,
    excludedAfter,
    currentLocation: KAIST_CENTER,
    pinDistribution,
    selectedSpecies: targets.map((target) => ({
      group: target.demo_group,
      name: target.display_name,
      quantity: target.quantity,
    })),
  };

  if (apply) {
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

function pointForObservation(
  speciesIndex: number,
  speciesCount: number,
  ordinal: number,
): { lat: number; lng: number } {
  const ringSizes = [8, 8, Math.max(speciesCount - 16, 1)];
  const radiiMetres = [55, 115, 185];
  const ringIndex = speciesIndex < 8 ? 0 : speciesIndex < 16 ? 1 : 2;
  const indexInRing =
    ringIndex === 0
      ? speciesIndex
      : ringIndex === 1
        ? speciesIndex - 8
        : speciesIndex - 16;
  const ringSize = ringSizes[ringIndex]!;
  const angle =
    (Math.PI * 2 * indexInRing) / ringSize + ringIndex * 0.19;
  const localOffsetMetres = (ordinal - 1) * 11;
  const radius = radiiMetres[ringIndex]! + localOffsetMetres;
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLng =
    metresPerDegreeLat * Math.cos((KAIST_CENTER.lat * Math.PI) / 180);

  return {
    lat: KAIST_CENTER.lat + (radius * Math.cos(angle)) / metresPerDegreeLat,
    lng: KAIST_CENTER.lng + (radius * Math.sin(angle)) / metresPerDegreeLng,
  };
}

function selectAssets(
  assets: AssetRow[],
  keys: string[],
  demoGroup: "insect" | "bird",
): SeedTarget[] {
  const selected = keys.map((key) => {
    const asset = assets.find((candidate) => candidate.asset_key === key);
    if (!asset) {
      throw new Error(`시연용 3D 자산을 찾지 못했습니다: ${key}`);
    }
    return {
      ...asset,
      quantity: 1,
      demo_group: demoGroup,
    };
  });
  return selected;
}
