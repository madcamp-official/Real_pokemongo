import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { TILE_TYPE_TO_KOREAN } from "../core/garden/gardenTypes.js";
import { SEED_GARDEN_ASSETS } from "../seed/gardenAssetCatalog.js";

const email = process.argv[2]?.trim().toLowerCase();
const outputPath = process.argv[3]?.trim();
if (!email || !outputPath) {
  throw new Error(
    "사용법: npm run garden:export -- user@example.com output.json",
  );
}
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL이 필요합니다.");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});

await client.connect();
try {
  const userResult = await client.query<{
    user_id: string;
    nickname: string;
  }>(
    `SELECT c.user_id, u.nickname
       FROM credential c
       JOIN app_user u ON u.id = c.user_id
      WHERE lower(c.email) = $1`,
    [email],
  );
  const user = userResult.rows[0];
  if (userResult.rowCount !== 1 || !user)
    throw new Error(`${email} 계정을 정확히 1개 찾지 못했습니다.`);

  const creatureResult = await client.query<{
      id: string;
      taxon_id: string;
      nickname: string | null;
      bond: number;
      taxon_name: string;
      created_at: Date;
    }>(
      `SELECT c.id, c.taxon_id, c.nickname, c.bond, c.created_at,
              t.kor_name AS taxon_name
         FROM creature c
         JOIN taxon t ON t.id = c.taxon_id
        WHERE c.user_id = $1
        ORDER BY c.created_at, c.id`,
      [user.user_id],
    );
  const placementResult = await client.query<{
    creature_id: string;
    row: number | null;
    col: number | null;
    placement_mode: "slot" | "free";
    world_x: number | null;
    world_y: number | null;
    world_z: number | null;
  }>(
      `SELECT creature_id, "row", col, placement_mode,
              world_x, world_y, world_z
         FROM creature_placement
        WHERE user_id = $1
        ORDER BY "row", col`,
      [user.user_id],
    );
  const tileResult = await client.query<{
    row: number;
    col: number;
    type: string;
  }>(
      `SELECT "row", col, type
         FROM garden_tile
        WHERE user_id = $1
        ORDER BY "row", col`,
      [user.user_id],
    );

  const assetByTaxonId = new Map(
    SEED_GARDEN_ASSETS
      .filter((asset) => asset.taxonId)
      .map((asset) => [asset.taxonId as string, asset]),
  );
  const placedIds = new Set(
    placementResult.rows.map((placement) => placement.creature_id),
  );
  const creatures = creatureResult.rows.map((creature) => {
    const asset = assetByTaxonId.get(creature.taxon_id);
    return {
      creatureId: creature.id,
      speciesId: creature.taxon_id,
      displayName:
        creature.nickname ?? asset?.displayName ?? creature.taxon_name,
      modelKey: asset?.assetKey ?? "",
      bond: creature.bond,
      capturedAt: new Date(creature.created_at).toISOString(),
    };
  });
  const taxonIds = [...new Set(creatures.map((creature) => creature.speciesId))];
  const inventory = taxonIds.map((taxonId) => {
    const asset = assetByTaxonId.get(taxonId);
    const owned = creatures.filter(
      (creature) => creature.speciesId === taxonId,
    );
    return {
      speciesId: taxonId,
      displayName: asset?.displayName ?? owned[0]?.displayName ?? "생태 친구",
      modelKey: asset?.assetKey ?? "",
      ownedCount: owned.length,
      placedCount: owned.filter((creature) =>
        placedIds.has(creature.creatureId)
      ).length,
    };
  });

  const payload = {
    schemaVersion: 2,
    userId: user.user_id,
    displayName: user.nickname,
    assets: SEED_GARDEN_ASSETS.map((asset) => ({
      assetKey: asset.assetKey,
      speciesId: asset.taxonId ?? "",
      displayName: asset.displayName,
      category: asset.category,
      resourcePath: asset.resourcePath,
      behaviourProfile: asset.behaviourProfile,
      displayScale: asset.displayScale,
      minimumAltitude: asset.minimumAltitude,
    })),
    creatures,
    placements: placementResult.rows.map((placement) => ({
      creatureId: placement.creature_id,
      placementMode: placement.placement_mode,
      row: placement.row ?? -1,
      col: placement.col ?? -1,
      worldX: placement.world_x ?? 0,
      worldY: placement.world_y ?? 3.9,
      worldZ: placement.world_z ?? 0,
    })),
    tiles: tileResult.rows.map((tile) => ({
      row: tile.row,
      col: tile.col,
      type:
        TILE_TYPE_TO_KOREAN[
          tile.type as keyof typeof TILE_TYPE_TO_KOREAN
        ] ?? tile.type,
    })),
    inventory,
  };

  const resolvedOutput = path.resolve(outputPath);
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        email,
        output: resolvedOutput,
        assets: payload.assets.length,
        species: inventory.length,
        creatures: creatures.length,
        placements: payload.placements.length,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
