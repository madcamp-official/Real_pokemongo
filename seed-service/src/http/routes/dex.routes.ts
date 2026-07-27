/**
 * F5 도감 + F6 종 카드 라우트. `/species/:speciesId/card`만 참조 데이터라 인증 불필요.
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { asTaxonId } from "../../core/domain/ids.js";
import {
  collectionEntryToDexEntry,
  buildDexCompletion,
  taxonToSpeciesCard,
  taxonGroupToKorean,
} from "../mappers.js";
import { getConfusableSciNames } from "../../core/identification/confusionPairs.js";
import type { Taxon } from "../../core/domain/types.js";

export function registerDexRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.get<{ Querystring: { group?: string; sort?: string } }>(
    "/dex",
    { preHandler: authenticate },
    async (request) => {
      const ctx = requireAuthContext(request);
      let taxa = await app.repos.taxa.list();

      // ?group= 은 FilterChips가 쓰는 5종 한글 라벨(곤충/양서류/식물/조류/기타) 그대로 받는다
      // — 프론트가 이미 클라이언트 필터링으로 쓰는 값과 동일해서 별도 매핑을 안 만들어도 된다.
      // 82종 규모에서는 list() 후 인메모리 필터가 리포지토리 인터페이스 확장보다 훨씬 단순하다.
      const { group, sort } = request.query;
      if (group) {
        taxa = taxa.filter((t) => taxonGroupToKorean(t.group) === group);
      }

      const entries = await Promise.all(
        taxa.map(async (t) => {
          const entry = await app.repos.collection.get(ctx.userId, t.id);
          // D단계: 종당 최대 1마리 규칙이라 0개 또는 1개. getByUserAndTaxon으로 바로 조회.
          const creature = await app.repos.creatures.getByUserAndTaxon(ctx.userId, t.id);
          return collectionEntryToDexEntry(t, entry, creature ? [creature] : []);
        }),
      );

      // ?sort=name 만 지원. 이름은 미해금 종도 실제 국명이 나오므로(collectionEntryToDexEntry
      // 참고) 정렬이 항상 의미 있다. 지정 안 하면 기존과 동일하게 taxa.list() 순서 유지.
      if (sort === "name") {
        entries.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      }

      return entries;
    },
  );

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

      // "비슷한 종"은 confusionPairs.ts(조건 2 강등 로직과 동일한 원천)를 그대로 써서
      // 이중 관리를 피한다. 학명이 도감 마스터에 없으면(82종 외) 조용히 건너뛴다.
      const confusableSciNames = getConfusableSciNames(taxon.sciName);
      const similarTaxa = (
        await Promise.all(confusableSciNames.map((sci) => app.repos.taxa.findBySciName(sci)))
      ).filter((t): t is Taxon => t !== null);

      return taxonToSpeciesCard(taxon, content, safety, similarTaxa);
    },
  );
}
