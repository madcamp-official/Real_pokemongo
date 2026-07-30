import { readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { upsertGardenAssetCatalog } from "../core/repositories/postgres/PostgresRepositories.js";
import { SEED_GARDEN_ASSETS } from "../seed/gardenAssetCatalog.js";

const resourcesRoot = path.resolve(
  process.cwd(),
  "../unity/BeetleDuel/Assets/Resources",
);
const modelsRoot = path.join(resourcesRoot, "Models");

function collectGlbs(directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectGlbs(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".glb")) {
      results.push(fullPath);
    }
  }
  return results;
}

const diskPaths = collectGlbs(modelsRoot)
  .map((file) =>
    path
      .relative(resourcesRoot, file)
      .replaceAll(path.sep, "/")
      .replace(/\.glb$/i, ""),
  )
  .filter((resourcePath) => !resourcePath.startsWith("Models/Environment/"))
  .sort();
const catalogPaths = SEED_GARDEN_ASSETS.map((asset) => asset.resourcePath).sort();
const catalogPathSet = new Set(catalogPaths);
const diskPathSet = new Set(diskPaths);
const missingInCatalog = diskPaths.filter((item) => !catalogPathSet.has(item));
const missingOnDisk = catalogPaths.filter((item) => !diskPathSet.has(item));

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL이 필요합니다.");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});

try {
  await upsertGardenAssetCatalog(pool, SEED_GARDEN_ASSETS);
  const result = await pool.query<{
    total: number;
    linked: number;
    min_scale: number;
    max_scale: number;
  }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(taxon_id)::int AS linked,
            MIN(display_scale)::real AS min_scale,
            MAX(display_scale)::real AS max_scale
       FROM garden_asset_catalog
      WHERE enabled = TRUE`,
  );
  const byCategory = await pool.query<{
    category: string;
    count: number;
    min_scale: number;
    max_scale: number;
  }>(
    `SELECT category,
            COUNT(*)::int AS count,
            MIN(display_scale)::real AS min_scale,
            MAX(display_scale)::real AS max_scale
       FROM garden_asset_catalog
      WHERE enabled = TRUE
      GROUP BY category
      ORDER BY category`,
  );

  console.log(
    JSON.stringify(
      {
        diskGlbCount: diskPaths.length,
        seedCatalogCount: SEED_GARDEN_ASSETS.length,
        database: result.rows[0],
        categories: byCategory.rows,
        missingInCatalog,
        missingOnDisk,
      },
      null,
      2,
    ),
  );

  if (
    diskPaths.length !== SEED_GARDEN_ASSETS.length ||
    result.rows[0]?.total !== SEED_GARDEN_ASSETS.length ||
    missingInCatalog.length > 0 ||
    missingOnDisk.length > 0
  ) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
