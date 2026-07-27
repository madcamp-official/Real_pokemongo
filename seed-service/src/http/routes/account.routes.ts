/**
 * F18 설정 & 계정 관리 라우트.
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { buildRestoreBundle } from "../mappers.js";

interface PrivacySettingsBody {
  location: boolean;
  photo: boolean;
}
const privacySettingsBodySchema = {
  type: "object",
  required: ["location", "photo"],
  properties: {
    location: { type: "boolean" },
    photo: { type: "boolean" },
  },
} as const;

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

  // F18 설정 화면의 "위치정보 수집"/"사진 수집·이용" 토글이 실제로 읽고 쓰는 대상.
  // location은 AccountService.setLocationStorage()가 이미 관리하는 User.locationStorageEnabled
  // (지도 F11 등 다른 기능이 실제로 참조하는 살아있는 값)를 그대로 재사용한다.
  // photo는 sightings.routes.ts가 저품질 재학습 샘플 저장 여부를 결정할 때 참조하는
  // ConsentRecord.photo다 — 별도 "설정" 저장소를 새로 만들지 않고 기존 동의 기록에
  // 그대로 이어 쓴다(동의 이력은 append-only라, 최신 값을 저장하면 곧 "현재 설정"이 된다).
  server.get("/account/privacy-settings", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const user = await app.accounts.getSelf(ctx);
    const consent = await app.repos.consent.getByUser(ctx.userId);
    // 동의 기록이 아직 없는 사용자(게스트로 시작해 한 번도 설정을 안 바꾼 경우)는
    // 온보딩 기본값(사진 수집 on)과 동일하게 맞춘다 — settingsStore.ts 기본값 참고.
    return { location: user.locationStorageEnabled, photo: consent?.photo ?? true };
  });

  server.patch<{ Body: PrivacySettingsBody }>(
    "/account/privacy-settings",
    { preHandler: authenticate, schema: { body: privacySettingsBodySchema } },
    async (request) => {
      const ctx = requireAuthContext(request);
      const { location, photo } = request.body;

      await app.accounts.setLocationStorage(ctx, location);

      const existing = await app.repos.consent.getByUser(ctx.userId);
      await app.repos.consent.save({
        userId: ctx.userId,
        // privacy 자체를 여기서 되돌릴 UI가 없으므로 기존 값을 유지한다(게스트처럼
        // 동의 기록이 아예 없던 경우만 true로 새로 세운다 — 이미 앱을 쓰고 있다는
        // 사실 자체가 기본적인 개인정보 처리에는 동의했다는 뜻이므로).
        privacy: existing?.privacy ?? true,
        location,
        photo,
        consentVersion: existing?.consentVersion ?? "settings-update",
        agreedAt: new Date().toISOString(),
      });

      return { location, photo };
    },
  );

  server.delete("/account", { preHandler: authenticate }, async (request, reply) => {
    const ctx = requireAuthContext(request);
    // 삭제 완전성/파기 리포트는 이미 A단계에서 검증된 DataRightsService.eraseUserData()가
    // 전부 처리한다(이 라우트는 그걸 그대로 호출할 뿐 새 로직을 추가하지 않는다).
    await app.dataRights.eraseUserData(ctx);
    return reply.code(200).send({});
  });
}
