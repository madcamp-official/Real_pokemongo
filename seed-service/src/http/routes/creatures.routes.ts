/**
 * F16/F9 개체(Creature) 라우트. 작명(D단계) + 상태 조회/상호작용(유대감, 이번에 추가).
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { asCreatureId } from "../../core/domain/ids.js";
import { daysTogether, isReunion, statusMessage, applyInteraction, reactionMessage } from "../../core/garden/bondRules.js";
import { buildCreatureStatus, buildInteractResponse } from "../mappers.js";

interface NameCreatureBody {
  nickname: string;
}
const nameCreatureBodySchema = {
  type: "object",
  required: ["nickname"],
  properties: { nickname: { type: "string", minLength: 1, maxLength: 20 } },
} as const;

export function registerCreatureRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.post<{ Params: { creatureId: string }; Body: NameCreatureBody }>(
    "/creatures/:creatureId/name",
    { preHandler: authenticate, schema: { body: nameCreatureBodySchema } },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const creature = await app.repos.creatures.get(asCreatureId(request.params.creatureId));

      // 미존재/남의 개체를 같은 404로 처리(존재 여부 누설 방지 — Authorization.ts 원칙과 동일).
      if (!creature || creature.userId !== ctx.userId) {
        return reply.code(404).send({ error: "not_found" });
      }

      await app.repos.creatures.save({ ...creature, nickname: request.body.nickname });
      return reply.code(200).send({});
    },
  );

  server.get<{ Params: { creatureId: string } }>(
    "/creatures/:creatureId/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const creature = await app.repos.creatures.get(asCreatureId(request.params.creatureId));
      if (!creature || creature.userId !== ctx.userId) {
        return reply.code(404).send({ error: "not_found" });
      }

      const reunion = isReunion(creature);
      return buildCreatureStatus({
        creatureId: creature.id,
        nickname: creature.nickname ?? null,
        daysTogether: daysTogether(creature.createdAt),
        bond: creature.bond,
        reunion,
        message: statusMessage(creature.id, creature.bond, reunion),
      });
    },
  );

  server.post<{ Params: { creatureId: string } }>(
    "/creatures/:creatureId/interact",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = requireAuthContext(request);
      const creature = await app.repos.creatures.get(asCreatureId(request.params.creatureId));
      if (!creature || creature.userId !== ctx.userId) {
        return reply.code(404).send({ error: "not_found" });
      }

      const result = applyInteraction(creature);
      await app.repos.creatures.save({
        ...creature,
        bond: result.bond,
        lastInteractionAt: result.lastInteractionAt,
      });

      return buildInteractResponse({
        bond: result.bond,
        bondLeveledUp: result.bondLeveledUp,
        reactionMessage: reactionMessage(creature.id),
        wasReunion: result.wasReunion,
      });
    },
  );
}
