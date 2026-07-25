/**
 * F18 설정 & 계정 관리 라우트.
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { buildRestoreBundle } from "../mappers.js";

export function registerAccountRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.get("/account/restore-bundle", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const progress = await app.collection.progress(ctx.userId);
    return buildRestoreBundle(progress.unlockedCount);
  });

  server.delete("/account", { preHandler: authenticate }, async (request, reply) => {
    const ctx = requireAuthContext(request);
    // 삭제 완전성/파기 리포트는 이미 A단계에서 검증된 DataRightsService.eraseUserData()가
    // 전부 처리한다(이 라우트는 그걸 그대로 호출할 뿐 새 로직을 추가하지 않는다).
    await app.dataRights.eraseUserData(ctx);
    return reply.code(200).send({});
  });
}
