/**
 * F16 홈가든 라우트. 타일 배치판 조회/저장 + 타일-종 호환성(저작 콘텐츠, 인증 불필요 —
 * species card와 동일하게 사용자 데이터가 아니라 정적 콘텐츠라 공개).
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { asCreatureId } from "../../core/domain/ids.js";
import { tileTypeFromKorean, type GardenTile, type CreaturePlacement } from "../../core/garden/gardenTypes.js";
import { TILE_COMPATIBILITY } from "../../seed/seedData.js";
import { gardenLayoutToApi } from "../mappers.js";

interface SaveLayoutBody {
  tiles: Array<{ row: number; col: number; type: string }>;
  placements: Array<{ creature_id: string; row: number; col: number }>;
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
        required: ["creature_id", "row", "col"],
        properties: {
          creature_id: { type: "string", minLength: 1 },
          row: { type: "integer", minimum: 0 },
          col: { type: "integer", minimum: 0 },
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
        const coordKey = `${p.row}:${p.col}`;
        if (seenPlacementCoords.has(coordKey)) {
          return reply.code(400).send({ error: "duplicate_placement", message: `이미 다른 개체가 놓인 자리예요: ${coordKey}` });
        }
        if (!seenTileCoords.has(coordKey)) {
          return reply.code(400).send({ error: "invalid_placement", message: `존재하지 않는 타일 좌표: ${coordKey}` });
        }
        const creature = await app.repos.creatures.get(asCreatureId(p.creature_id));
        // 남의 개체거나 존재하지 않으면 같은 에러로(존재 여부 누설 방지 — Authorization.ts 원칙).
        if (!creature || creature.userId !== ctx.userId) {
          return reply.code(400).send({ error: "invalid_placement", message: "존재하지 않는 개체예요." });
        }
        seenCreatureIds.add(p.creature_id);
        seenPlacementCoords.add(coordKey);
        placements.push({ row: p.row, col: p.col, creatureId: creature.id });
      }

      await app.repos.garden.saveLayout(ctx.userId, { tiles, placements });
      return reply.code(200).send({});
    },
  );

  server.get("/garden/tile-compatibility", async () => TILE_COMPATIBILITY);
}
