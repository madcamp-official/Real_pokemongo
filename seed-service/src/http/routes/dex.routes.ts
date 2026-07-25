/**
 * F5 도감 + F6 종 카드 라우트. `/species/:speciesId/card`만 참조 데이터라 인증 불필요.
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { asTaxonId } from "../../core/domain/ids.js";
import { collectionEntryToDexEntry, buildDexCompletion, taxonToSpeciesCard } from "../mappers.js";

export function registerDexRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.get("/dex", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const taxa = await app.repos.taxa.list();
    return Promise.all(
      taxa.map(async (t) => {
        const entry = await app.repos.collection.get(ctx.userId, t.id);
        // D단계: 종당 최대 1마리 규칙이라 0개 또는 1개. getByUserAndTaxon으로 바로 조회.
        const creature = await app.repos.creatures.getByUserAndTaxon(ctx.userId, t.id);
        return collectionEntryToDexEntry(t, entry, creature ? [creature] : []);
      }),
    );
  });

  server.get("/dex/completion", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const progress = await app.collection.progress(ctx.userId);
    return buildDexCompletion(progress.totalCount, progress.unlockedCount);
  });

  server.get<{ Params: { speciesId: string } }>(
    "/species/:speciesId/card",
    async (request, reply) => {
      const taxon = await app.repos.taxa.get(asTaxonId(request.params.speciesId));
      if (!taxon) {
        return reply.code(404).send({ error: "not_found", message: "해당 종을 찾을 수 없습니다." });
      }
      const content = app.content.get(taxon.id);
      // ContentCardService.render()가 이미 안전 안내 계산을 해뒀다 — 중복 계산하지 않고
      // 그 결과(.safety)만 재사용한다(SafetyFilter를 여기서 새로 만들지 않음).
      const { safety } = app.content.render(taxon);
      return taxonToSpeciesCard(taxon, content, safety);
    },
  );
}
