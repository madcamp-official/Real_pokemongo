/**
 * F16 개체(Creature) 작명 라우트 (D단계). 홈가든 전체(배치·상호작용)는 범위 밖 —
 * 이번엔 "종을 처음 해금하면 개체가 자동 생성되고, 나중에 이름을 붙일 수 있다"만 다룬다.
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { asCreatureId } from "../../core/domain/ids.js";

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
}
