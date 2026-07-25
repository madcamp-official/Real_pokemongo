/**
 * F8 배지 · 레벨 보상 라우트 (D단계).
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { badgeDefToApiBadge, buildXpProfile } from "../mappers.js";

interface ClaimBadgeBody {
  badge_id: string;
}
const claimBadgeBodySchema = {
  type: "object",
  required: ["badge_id"],
  properties: { badge_id: { type: "string", minLength: 1 } },
} as const;

export function registerBadgeRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.get("/profile/xp", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const user = await app.accounts.getSelf(ctx);
    return buildXpProfile(user, app.rewards.getLevelCurve());
  });

  server.get("/badges", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const defs = app.rewards.listBadgeDefinitions();
    return Promise.all(
      defs.map(async (def) => {
        const earned = await app.repos.badges.get(ctx.userId, def.id);
        return badgeDefToApiBadge(def, earned);
      }),
    );
  });

  server.post<{ Body: ClaimBadgeBody }>(
    "/badges/claim",
    { preHandler: authenticate, schema: { body: claimBadgeBodySchema } },
    async (request) => {
      const ctx = requireAuthContext(request);
      const outcome = await app.rewards.claimBadge(ctx.userId, request.body.badge_id);
      const user = await app.accounts.getSelf(ctx);
      return buildXpProfile(user, app.rewards.getLevelCurve(), outcome.newLevel !== null);
    },
  );
}
