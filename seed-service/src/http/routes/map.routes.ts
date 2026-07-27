/**
 * F11 지도 & 탐험 기록 라우트.
 *
 * v2: 일러스트 스타일 지도(정규화 0~1 좌표 + blob) 대신 실제 카카오맵을 쓴다.
 * `/map.html`은 WebView가 로드할 정적 페이지(카카오맵 JS SDK 임베드) — 인증 불필요,
 * 개인정보를 전혀 담지 않는다(핀 데이터는 RN이 postMessage로 나중에 주입).
 * `/map/pins`·`/map/explored-regions`는 인증 필요(본인 관찰만 반환).
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { buildMapPin, buildExploredRegions } from "../mappers.js";
import { mapHtml } from "./mapHtml.js";

export function registerMapRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  server.get("/map.html", async (request, reply) => {
    reply.type("text/html").send(mapHtml(app.config.map.kakaoJsKey ?? ""));
  });

  server.get("/map/pins", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const entries = await app.repos.collection.listByUser(ctx.userId);

    const pins = await Promise.all(
      entries
        .filter((e) => e.unlocked && e.firstObservationId)
        .map(async (e) => {
          const obs = await app.repos.observations.get(e.firstObservationId!);
          if (!obs?.preciseCoord) return null;
          const taxon = await app.repos.taxa.get(e.taxonId);
          if (!taxon) return null;
          return buildMapPin(taxon, obs.preciseCoord.lat, obs.preciseCoord.lng);
        }),
    );

    return pins.filter((p): p is NonNullable<typeof p> => p !== null);
  });

  server.get("/map/explored-regions", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    const user = await app.repos.users.get(ctx.userId);
    const observations = await app.repos.observations.listByUser(ctx.userId);

    // 위치 저장 설정이 꺼져 있으면 현재 위치는 항상 숨긴다(프라이버시 설정 반영,
    // MapScreen.tsx가 클라이언트에서도 한 번 더 가리지만 서버도 정직하게 null을 준다).
    let currentLocation: { lat: number; lng: number } | null = null;
    if (user?.locationStorageEnabled) {
      const withCoord = observations
        .filter((o) => o.preciseCoord)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const latest = withCoord[0];
      if (latest?.preciseCoord) {
        currentLocation = { lat: latest.preciseCoord.lat, lng: latest.preciseCoord.lng };
      }
    }

    return buildExploredRegions(currentLocation);
  });
}
