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
  // 보여준다는 뜻이라, QuestEngine.listVisibleQuests가 이미 그 목록이다(활성 기간 +
  // 실제 오늘 날짜 기준 계절 필터 + 오늘의 데일리 퀘스트 생성까지 한 곳에서 처리 —
  // applyObservation이 관찰 적용 시 쓰는 것과 동일한 단일 진실 원천).
  server.get("/quests", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const quests = await app.quests.listVisibleQuests(new Date());
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
