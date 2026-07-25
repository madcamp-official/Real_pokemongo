/**
 * F10 퀘스트 라우트 (D단계).
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { questToApiQuest, buildXpProfile } from "../mappers.js";

export function registerQuestRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  // 프론트는 항상 ?active=true로 부른다(app/src/api/quests.ts) — 지금 활성 기간인 퀘스트만
  // 보여준다는 뜻이라, QuestRepository.listActive()가 이미 그 목록이다(만료/로테이션은
  // QuestEngine.isActiveAt이 관찰 적용 시 판단하는 것과 별개로, 여기선 활성 기간만 거른다).
  server.get("/quests", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const now = new Date().toISOString();
    const quests = (await app.repos.quests.listActive()).filter(
      (q) => q.activeFrom <= now && (!q.activeTo || q.activeTo >= now),
    );
    return Promise.all(
      quests.map(async (quest) => {
        const progress = await app.repos.quests.getProgress(ctx.userId, quest.id);
        return questToApiQuest(quest, progress);
      }),
    );
  });

  server.post<{ Params: { questId: string } }>(
    "/quests/:questId/claim",
    { preHandler: authenticate },
    async (request) => {
      const ctx = requireAuthContext(request);
      const outcome = await app.rewards.claimQuest(ctx.userId, request.params.questId);
      const user = await app.accounts.getSelf(ctx);
      return buildXpProfile(user, app.rewards.getLevelCurve(), outcome.newLevel !== null);
    },
  );
}
