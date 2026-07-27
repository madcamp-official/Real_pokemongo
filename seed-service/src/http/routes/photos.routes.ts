/**
 * F6 도감 상세의 "지금까지 찍은 사진" 갤러리 라우트.
 *
 * 목록(`/species/:speciesId/photos`)과 실제 바이트 서빙(`/media/:observationId`)을
 * 분리한다 — 목록은 가벼운 메타데이터만 돌려주고, 무거운 이미지 바이트는 필요한 시점에
 * <Image>가 개별 요청으로 받아간다(썸네일 여러 장을 한 응답에 base64로 우겨넣지 않음).
 *
 * 인증 방식이 두 라우트에서 서로 다르다 — 의도적:
 *  - `/species/:speciesId/photos`는 일반 로그인 토큰(Authorization 헤더)으로 인증한다.
 *    소유권 검사(자기 관찰만 보임)도 여기서 끝난다.
 *  - `/media/:observationId`는 로그인 토큰을 전혀 보지 않고, 위 목록 API가 응답에
 *    함께 실어준 "이 관찰 전용, 5분 만료" 서명 토큰(`mt` 쿼리)만 검증한다. 이유:
 *    React Native `<Image source={{ uri, headers }}>`의 커스텀 헤더가 실기기(Android/
 *    Expo) 테스트에서 실제로 전달되지 않는 것을 서버 로그로 확인했다 — Authorization
 *    헤더 없이 요청이 도착했다. `<Image>`는 헤더는 못 붙여도 URL은 그대로 쓰므로,
 *    만료 없는 로그인 토큰을 URL에 노출하는 대신 mediaToken.ts의 단기 서명 토큰을
 *    쓴다(core/media/mediaToken.ts 상단 주석 참고, S3 presigned URL과 같은 패턴).
 *    소유권 검사는 토큰 "발급" 시점(목록 API, 인증 필요)에서 끝나고, "검증" 시점은
 *    서명·만료만 본다 — 위조/재사용/만료 토큰은 관찰 존재 여부와 무관하게 전부 같은
 *    401이라, 여기서도 "존재 여부 누설 금지" 원칙이 자연히 유지된다.
 */
import type { FastifyInstance } from "fastify";
import type { App } from "../../composition.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";
import { asTaxonId, asObservationId } from "../../core/domain/ids.js";
import { sniffImageFormat } from "../../core/media/MediaSanitizer.js";
import { signMediaToken, verifyMediaToken } from "../../core/media/mediaToken.js";

export function registerPhotoRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
  jwtSecret: string,
): void {
  server.get<{ Params: { speciesId: string } }>(
    "/species/:speciesId/photos",
    { preHandler: authenticate },
    async (request) => {
      const ctx = requireAuthContext(request);
      const taxonId = asTaxonId(request.params.speciesId);

      // 82종 규모라 listByUser 후 인메모리 필터가 리포지토리 인터페이스를 확장하는 것보다
      // 단순하다(dex.routes.ts의 group 필터와 같은 판단).
      const observations = await app.repos.observations.listByUser(ctx.userId);
      const withPhotos = observations
        .filter((o) => o.taxonId === taxonId && o.media.length > 0)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // 최신 촬영이 먼저

      return {
        photos: withPhotos.map((o) => {
          const mt = signMediaToken(o.id, jwtSecret);
          return {
            observation_id: o.id,
            url: `/media/${o.id}?mt=${mt}`,
            taken_at: o.timestamp,
          };
        }),
      };
    },
  );

  server.get<{ Params: { observationId: string }; Querystring: { mt?: string } }>(
    "/media/:observationId",
    async (request, reply) => {
      const observationId = request.params.observationId;
      const mt = request.query.mt;
      if (!mt || !verifyMediaToken(mt, observationId, jwtSecret)) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const observation = await app.repos.observations.get(asObservationId(observationId));
      if (!observation || observation.media.length === 0) {
        return reply.code(404).send({ error: "not_found" });
      }

      // 관찰당 대표 이미지 1장(sightings.routes.ts의 /identify/confirm 참고 — 프레임을
      // 합친 보정본 하나만 저장한다). media[0]이 곧 그 대표 이미지.
      const bytes = await app.mediaStore.read(observation.media[0]!);
      if (!bytes) {
        return reply.code(404).send({ error: "not_found" });
      }

      const format = sniffImageFormat(bytes);
      // 토큰 자체가 이미 5분 만료라, 클라이언트 캐시는 그보다 훨씬 짧게 잡는다 — 만료된
      // mt로 재요청해도 어차피 401이니 오래 캐시해봤자 이득이 없고, 자칫 만료 전 토큰의
      // 캐시가 만료 이후까지 남아있는 걸 방지한다.
      reply.header("Cache-Control", "private, max-age=240");
      return reply.type(format === "png" ? "image/png" : "image/jpeg").send(Buffer.from(bytes));
    },
  );
}
