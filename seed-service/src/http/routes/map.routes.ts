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

function mapHtml(kakaoJsKey: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden;}
#error{display:none;position:absolute;top:0;left:0;right:0;padding:16px;text-align:center;
font-family:sans-serif;font-size:13px;color:#666;background:#fff;}</style>
</head>
<body>
<div id="map"></div>
<div id="error">지도를 불러오지 못했어요.</div>
<script>
function post(msg) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
}
function showError(reason) {
  document.getElementById("error").style.display = "block";
  post({ type: "error", message: reason });
}
</script>
<script
  src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"
  onerror="showError('sdk_script_failed')"
></script>
<script>
if (window.kakao && window.kakao.maps) {
  // 도메인 미등록 등으로 콜백이 영영 안 올 수 있어 타임아웃으로 방어한다(실기기 테스트로
  // 발견 — 카카오 개발자 콘솔의 "카카오맵" 제품이 비활성화돼 있으면 스크립트 자체는
  // 로드되지만 kakao.maps.load()의 콜백이 조용히 안 온다).
  var loaded = false;
  var timeoutId = setTimeout(function () {
    if (!loaded) showError("kakao_maps_load_timeout");
  }, 8000);

  kakao.maps.load(function () {
    loaded = true;
    clearTimeout(timeoutId);

    var map = new kakao.maps.Map(document.getElementById("map"), {
      center: new kakao.maps.LatLng(37.5665, 126.9780), // 기본 중심: 서울
      level: 6,
    });
    var markers = [];

    function clearMarkers() {
      markers.forEach(function (m) { m.setMap(null); });
      markers = [];
    }

    function renderPins(pins) {
      clearMarkers();
      pins.forEach(function (pin) {
        var pos = new kakao.maps.LatLng(pin.lat, pin.lng);
        var marker = new kakao.maps.Marker({ position: pos, map: map });
        kakao.maps.event.addListener(marker, "click", function () {
          post({ type: "pin_press", species_id: pin.species_id });
        });
        markers.push(marker);
      });
    }

    function onMessage(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === "set_pins") renderPins(data.pins || []);
        if (data.type === "set_center" && typeof data.lat === "number") {
          map.setCenter(new kakao.maps.LatLng(data.lat, data.lng));
        }
      } catch (err) {
        post({ type: "error", message: String(err) });
      }
    }
    document.addEventListener("message", onMessage); // Android WebView
    window.addEventListener("message", onMessage); // iOS WKWebView

    post({ type: "ready" });
  });
} else {
  showError("kakao_sdk_not_defined");
}
</script>
</body>
</html>`;
}

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
