/**
 * F16 홈가든 라우트. 타일 배치판 조회/저장 + 타일-종 호환성(저작 콘텐츠, 인증 불필요 —
 * species card와 동일하게 사용자 데이터가 아니라 정적 콘텐츠라 공개).
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { asCreatureId } from "../../core/domain/ids.js";
import {
  TILE_TYPE_TO_KOREAN,
  tileTypeFromKorean,
  type GardenTile,
  type CreaturePlacement,
} from "../../core/garden/gardenTypes.js";
import { TILE_COMPATIBILITY } from "../../seed/seedData.js";
import { SEED_GARDEN_ASSETS } from "../../seed/gardenAssetCatalog.js";
import { gardenLayoutToApi } from "../mappers.js";

interface SaveLayoutBody {
  tiles: Array<{ row: number; col: number; type: string }>;
  placements: Array<{
    creature_id: string;
    placement_mode?: "slot" | "free";
    row?: number;
    col?: number;
    world_x?: number;
    world_y?: number;
    world_z?: number;
  }>;
}
const saveLayoutBodySchema = {
  type: "object",
  required: ["tiles", "placements"],
  properties: {
    tiles: {
      type: "array",
      items: {
        type: "object",
        required: ["row", "col", "type"],
        properties: {
          row: { type: "integer", minimum: 0 },
          col: { type: "integer", minimum: 0 },
          type: { type: "string", minLength: 1 },
        },
      },
    },
    placements: {
      type: "array",
      items: {
        type: "object",
        required: ["creature_id"],
        properties: {
          creature_id: { type: "string", minLength: 1 },
          placement_mode: { type: "string", enum: ["slot", "free"] },
          row: { type: "integer", minimum: 0 },
          col: { type: "integer", minimum: 0 },
          world_x: { type: "number", minimum: -55, maximum: 55 },
          world_y: { type: "number", minimum: 3, maximum: 30 },
          world_z: { type: "number", minimum: 0, maximum: 40 },
        },
      },
    },
  },
} as const;

export function registerGardenRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.get("/garden/layout", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const layout = await app.repos.garden.getLayout(ctx.userId);

    const creatures = await app.repos.creatures.listByUser(ctx.userId);
    const taxonIdByCreatureId = new Map(creatures.map((c) => [c.id as string, c.taxonId as string]));

    return gardenLayoutToApi(layout, taxonIdByCreatureId);
  });

  /**
   * PC 홈가든이 한 번에 필요한 보유 개체, 3D 카탈로그, 현재 배치를 내려준다.
   * 같은 taxon_id의 서로 다른 creature_id가 모두 포함되므로 보유 수 내 다중 배치가 가능하다.
   */
  server.get("/garden/bootstrap", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const [user, layout, creatures] = await Promise.all([
      app.repos.users.get(ctx.userId),
      app.repos.garden.getLayout(ctx.userId),
      app.repos.creatures.listByUser(ctx.userId),
    ]);

    const assetByTaxonId = new Map(
      SEED_GARDEN_ASSETS
        .filter((asset) => asset.taxonId)
        .map((asset) => [asset.taxonId as string, asset]),
    );
    const placementByCreatureId = new Map(
      layout.placements.map((placement) => [placement.creatureId as string, placement]),
    );
    const uniqueTaxonIds = [...new Set(creatures.map((creature) => creature.taxonId))];
    const taxa = await Promise.all(
      uniqueTaxonIds.map((taxonId) => app.repos.taxa.get(taxonId)),
    );
    const taxonById = new Map(
      taxa
        .filter((taxon) => taxon)
        .map((taxon) => [taxon!.id as string, taxon!]),
    );

    return {
      schemaVersion: 2,
      userId: ctx.userId,
      displayName: user?.nickname ?? "Nature Go 탐험가",
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
      creatures: creatures.map((creature) => {
        const asset = assetByTaxonId.get(creature.taxonId as string);
        return {
          creatureId: creature.id,
          speciesId: creature.taxonId,
          displayName: creature.nickname
            ?? asset?.displayName
            ?? taxonById.get(creature.taxonId as string)?.korName
            ?? "생태 친구",
          modelKey: asset?.assetKey ?? "",
          bond: creature.bond,
          capturedAt: creature.createdAt,
        };
      }),
      placements: layout.placements.map((placement) => ({
        creatureId: placement.creatureId,
        placementMode: placement.placementMode ?? "slot",
        row: placement.row ?? -1,
        col: placement.col ?? -1,
        worldX: placement.worldX ?? 0,
        worldY: placement.worldY ?? 3.9,
        worldZ: placement.worldZ ?? 0,
      })),
      tiles: layout.tiles.map((tile) => ({
        row: tile.row,
        col: tile.col,
        type: TILE_TYPE_TO_KOREAN[tile.type],
      })),
      inventory: uniqueTaxonIds
        .map((taxonId) => {
          const asset = assetByTaxonId.get(taxonId as string);
          const taxon = taxonById.get(taxonId as string);
          const owned = creatures.filter((c) => c.taxonId === taxonId);
          return {
            speciesId: taxonId,
            displayName: asset?.displayName ?? taxon?.korName ?? "생태 친구",
            modelKey: asset?.assetKey ?? "",
            ownedCount: owned.length,
            placedCount: owned.filter((c) => placementByCreatureId.has(c.id as string)).length,
          };
        })
        .filter((entry) => entry.ownedCount > 0),
    };
  });

  server.put<{ Body: SaveLayoutBody }>(
    "/garden/layout",
    { preHandler: authenticate, schema: { body: saveLayoutBodySchema } },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const { tiles: rawTiles, placements: rawPlacements } = request.body;

      // ── 타일 변환 + 중복 좌표 검증 ──
      const tiles: GardenTile[] = [];
      const seenTileCoords = new Set<string>();
      for (const t of rawTiles) {
        const type = tileTypeFromKorean(t.type);
        if (!type) {
          return reply.code(400).send({ error: "invalid_tile_type", message: `알 수 없는 타일 종류: ${t.type}` });
        }
        const key = `${t.row}:${t.col}`;
        if (seenTileCoords.has(key)) {
          return reply.code(400).send({ error: "duplicate_tile", message: `타일 좌표 중복: ${key}` });
        }
        seenTileCoords.add(key);
        tiles.push({ row: t.row, col: t.col, type });
      }

      // ── 배치 검증: 소유권(IDOR 방지) + 유효 타일 좌표 + 개체 중복 배치 방지 ──
      const seenCreatureIds = new Set<string>();
      const seenPlacementCoords = new Set<string>();
      const placements: CreaturePlacement[] = [];
      for (const p of rawPlacements) {
        if (seenCreatureIds.has(p.creature_id)) {
          return reply.code(400).send({ error: "duplicate_placement", message: "한 개체는 한 자리에만 놓을 수 있어요." });
        }
        const placementMode = p.placement_mode ?? "slot";
        let coordKey: string | null = null;
        if (placementMode === "slot") {
          if (!Number.isInteger(p.row) || !Number.isInteger(p.col)) {
            return reply.code(400).send({
              error: "invalid_placement",
              message: "식물 슬롯 배치에는 row와 col이 필요해요.",
            });
          }
          coordKey = `${p.row}:${p.col}`;
          if (seenPlacementCoords.has(coordKey)) {
            return reply.code(400).send({ error: "duplicate_placement", message: `이미 다른 식물이 놓인 자리예요: ${coordKey}` });
          }
          if (!seenTileCoords.has(coordKey)) {
            return reply.code(400).send({ error: "invalid_placement", message: `존재하지 않는 식물 슬롯: ${coordKey}` });
          }
        } else if (
          typeof p.world_x !== "number"
          || typeof p.world_y !== "number"
          || typeof p.world_z !== "number"
          || !Number.isFinite(p.world_x)
          || !Number.isFinite(p.world_y)
          || !Number.isFinite(p.world_z)
          || p.world_x < -55
          || p.world_x > 55
          || p.world_y < 3
          || p.world_y > 30
          || p.world_z < 0
          || p.world_z > 40
        ) {
          return reply.code(400).send({
            error: "invalid_placement",
            message: "자유 배치 좌표가 온실 범위를 벗어났어요.",
          });
        }
        const creature = await app.repos.creatures.get(asCreatureId(p.creature_id));
        // 남의 개체거나 존재하지 않으면 같은 에러로(존재 여부 누설 방지 — Authorization.ts 원칙).
        if (!creature || creature.userId !== ctx.userId) {
          return reply.code(400).send({ error: "invalid_placement", message: "존재하지 않는 개체예요." });
        }
        const gardenAsset = SEED_GARDEN_ASSETS.find(
          (asset) => asset.taxonId === creature.taxonId,
        );
        const requiresPlantSlot = gardenAsset?.category === "plant"
          || gardenAsset?.category === "tree";
        if (
          (requiresPlantSlot && placementMode !== "slot")
          || (!requiresPlantSlot && placementMode !== "free")
        ) {
          return reply.code(400).send({
            error: "invalid_placement_mode",
            message: requiresPlantSlot
              ? "식물과 나무는 식물 슬롯에 놓아야 해요."
              : "동물과 곤충은 온실 바닥에 자유 배치해야 해요.",
          });
        }
        seenCreatureIds.add(p.creature_id);
        if (coordKey)
          seenPlacementCoords.add(coordKey);
        placements.push(
          placementMode === "free"
            ? {
                placementMode,
                creatureId: creature.id,
                worldX: p.world_x!,
                worldY: p.world_y!,
                worldZ: p.world_z!,
              }
            : {
                placementMode,
                row: p.row!,
                col: p.col!,
                creatureId: creature.id,
              },
        );
      }

      await app.repos.garden.saveLayout(ctx.userId, { tiles, placements });
      return reply.code(200).send({});
    },
  );

  server.get("/garden/tile-compatibility", async () => TILE_COMPATIBILITY);
}
