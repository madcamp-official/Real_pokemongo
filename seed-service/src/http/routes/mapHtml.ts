/**
 * WebView 가 로드하는 카카오맵 페이지 (F11).
 *
 * 실제 카카오맵 타일 위에 "포켓몬고 스타일" 연출을 얹는다:
 *   - 타일에 CSS 필터를 걸어 채도/명도를 게임풍 파스텔 톤으로 밀어준다
 *     (카카오맵 JS SDK 는 구글맵처럼 타일 스타일 커스터마이즈를 지원하지 않아,
 *      색보정은 이 방법이 사실상 유일하다)
 *   - 발견 핀은 기본 마커 대신 CustomOverlay 로 그린다(흰 카드 + 분류색 헤더 +
 *     검은 테두리 + 아래 화살표, 위아래로 살짝 떠다니는 애니메이션)
 *   - 현재 위치는 파란 점 + 퍼지는 펄스 링
 *   - "나만의 탐험 구역"은 점선 원(Circle)으로 그린다
 *
 * RN 과는 postMessage 로만 통신한다(핀 주입 / 중심 이동 / 핀 클릭 · 지도 상태 통지).
 * 이 페이지는 인증이 필요 없고 개인정보를 담지 않는다 — 핀 데이터는 나중에 주입된다.
 */

/** 분류군별 핀 헤더 색. 앱의 ExploreMapCanvas 와 같은 팔레트를 쓴다. */
const GROUP_COLORS: Record<string, string> = {
  곤충: "#F0705A",
  양서류: "#4FA3D9",
  식물: "#6BAE5A",
  기타: "#A88F7D",
};

export function mapHtml(kakaoJsKey: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;
    background:#E4EBDA;}
  #map{width:100%;height:100%;}

  /* 카카오 타일을 게임풍 파스텔로 — 채도를 낮추고 살짝 밝게 띄운다.
     지도 위에 얹는 오버레이(핀·현위치)는 이 필터를 받지 않아야 색이 죽지 않으므로,
     필터는 타일 컨테이너에만 걸고 오버레이는 필터 밖 레이어에 그린다. */
  #map > div > div:first-child { filter:saturate(.38) brightness(1.12) contrast(.84); }

  /* 실패 안내는 RN 쪽 배너가 담당한다(페이지 상단에 그리면 앱 타이틀과 겹친다) —
     여기서는 배경만 남기고 숨긴다. 실패 사실은 postMessage 로 RN 에 전달된다. */
  #error{display:none;}

  /* ── 발견 핀 ─────────────────────────────────────────────── */
  .pin{position:relative;cursor:pointer;animation:bob 2.6s ease-in-out infinite;}
  .pin-card{width:42px;height:42px;background:#fff;border:2px solid #201E1D;
    display:flex;flex-direction:column;box-shadow:0 5px 12px rgba(0,0,0,.22);}
  .pin-head{height:7px;}
  .pin-body{flex:1;display:flex;align-items:center;justify-content:center;
    font-size:19px;line-height:1;}
  .pin-tail{width:0;height:0;margin:0 auto;
    border-left:7px solid transparent;border-right:7px solid transparent;
    border-top:9px solid #201E1D;}
  .pin-danger{position:absolute;top:-9px;right:-9px;width:18px;height:18px;
    background:#C0453B;color:#fff;font-size:12px;font-weight:800;line-height:18px;
    text-align:center;box-shadow:0 2px 5px rgba(0,0,0,.3);}
  @keyframes bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-5px);}}

  /* ── 현재 위치 ───────────────────────────────────────────── */
  .me{position:relative;width:0;height:0;}
  .me-dot{position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:50%;
    background:#2B6FE0;border:4px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3);}
  .me-ring{position:absolute;left:-44px;top:-44px;width:88px;height:88px;border-radius:50%;
    background:rgba(43,111,224,.28);animation:pulsering 2.6s ease-out infinite;}
  @keyframes pulsering{0%{transform:scale(.35);opacity:.55;}70%{opacity:0;}100%{transform:scale(1);opacity:0;}}

  /* 참조 시안의 탐험 구역 캡션. Circle 자체에는 라벨 기능이 없어서 같은 좌표계를
     쓰는 CustomOverlay로 붙인다. 지도 확대/이동에도 원과 함께 자연스럽게 움직인다. */
  .zone-label{position:relative;background:#F08A6E;color:#fff;padding:6px 12px;
    font-size:13px;font-weight:800;white-space:nowrap;letter-spacing:.1px;
    box-shadow:0 4px 12px rgba(240,138,110,.35);}
  .zone-label:after{content:'';position:absolute;left:50%;bottom:-11px;margin-left:-8px;
    border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid #F08A6E;}
</style>
</head>
<body>
<div id="map"></div>
<div id="error"></div>
<script>
function post(msg){
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
}
function showError(reason, detail){
  post({ type:"error", message: reason, detail: detail || "" });
}
var GROUP_COLORS = ${JSON.stringify(GROUP_COLORS)};
</script>
<script
  src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"
  onerror="showError('sdk_script_failed','네트워크 또는 앱키를 확인해 주세요.')"
></script>
<script>
if (!window.kakao || !window.kakao.maps) {
  showError("kakao_sdk_not_defined", "지도 SDK를 불러오지 못했어요.");
} else {
  // 도메인 미등록 등으로 콜백이 영영 안 올 수 있어 타임아웃으로 방어한다(실기기 테스트로
  // 발견 — 카카오 개발자 콘솔의 "카카오맵" 제품이 비활성화돼 있거나 플랫폼(Web) 사이트
  // 도메인이 미등록이면 스크립트는 로드되지만 kakao.maps.load() 콜백이 조용히 안 온다).
  var loaded = false;
  var timeoutId = setTimeout(function(){
    if (!loaded) showError("kakao_maps_load_timeout",
      "카카오 개발자 콘솔에 이 주소가 Web 플랫폼으로 등록됐는지 확인해 주세요.");
  }, 8000);

  kakao.maps.load(function(){
    loaded = true;
    clearTimeout(timeoutId);

    var container = document.getElementById("map");
    var map = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(37.5665, 126.9780), // 기본 중심: 서울
      level: 4,
    });

    var pinOverlays = [];
    var meOverlay = null;
    var zoneCircle = null;
    var zoneLabelOverlay = null;

    function clearPins(){
      pinOverlays.forEach(function(o){ o.setMap(null); });
      pinOverlays = [];
    }

    function pinElement(pin, index){
      var color = GROUP_COLORS[pin.group] || GROUP_COLORS["기타"];
      var wrap = document.createElement("div");
      wrap.className = "pin";
      // 핀마다 애니메이션 위상을 어긋나게 해 한꺼번에 튀지 않게 한다.
      wrap.style.animationDelay = (index * 0.4).toFixed(2) + "s";

      var card = document.createElement("div");
      card.className = "pin-card";

      var head = document.createElement("div");
      head.className = "pin-head";
      head.style.background = color;

      var body = document.createElement("div");
      body.className = "pin-body";
      body.textContent = pin.emoji || "\\uD83D\\uDC1B";

      card.appendChild(head);
      card.appendChild(body);

      if (pin.is_dangerous) {
        var badge = document.createElement("div");
        badge.className = "pin-danger";
        badge.textContent = "!";
        card.appendChild(badge);
      }

      var tail = document.createElement("div");
      tail.className = "pin-tail";

      wrap.appendChild(card);
      wrap.appendChild(tail);
      wrap.addEventListener("click", function(e){
        e.stopPropagation();
        post({ type:"pin_press", species_id: pin.species_id });
      });
      return wrap;
    }

    function renderPins(pins){
      clearPins();
      (pins || []).forEach(function(pin, i){
        var overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(pin.lat, pin.lng),
          content: pinElement(pin, i),
          yAnchor: 1,   // 꼬리 끝이 좌표를 가리키도록
          clickable: true,
        });
        overlay.setMap(map);
        pinOverlays.push(overlay);
      });
    }

    function renderMe(lat, lng, zoneRadius){
      var pos = new kakao.maps.LatLng(lat, lng);
      if (!meOverlay) {
        var el = document.createElement("div");
        el.className = "me";
        var ring = document.createElement("div"); ring.className = "me-ring";
        var dot = document.createElement("div"); dot.className = "me-dot";
        el.appendChild(ring); el.appendChild(dot);
        meOverlay = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 5 });
        meOverlay.setMap(map);
      } else {
        meOverlay.setPosition(pos);
      }

      // "나만의 탐험 구역" — 현재 위치를 감싸는 점선 원.
      if (zoneRadius > 0) {
        if (!zoneCircle) {
          zoneCircle = new kakao.maps.Circle({
            center: pos, radius: zoneRadius,
            strokeWeight: 3, strokeColor: "#F08A6E", strokeOpacity: 1, strokeStyle: "dashed",
            fillColor: "#F08A6E", fillOpacity: 0.10,
          });
          zoneCircle.setMap(map);
        } else {
          zoneCircle.setPosition(pos);
        }

        // 중심에서 반지름만큼 북쪽에 붙여 원의 상단을 가리키게 한다. 위도 1도는 약 111km.
        var labelPos = new kakao.maps.LatLng(lat + zoneRadius / 111000, lng);
        if (!zoneLabelOverlay) {
          var label = document.createElement("div");
          label.className = "zone-label";
          label.textContent = "나만의 탐험 구역";
          zoneLabelOverlay = new kakao.maps.CustomOverlay({
            position: labelPos, content: label, yAnchor: 1, zIndex: 6,
          });
          zoneLabelOverlay.setMap(map);
        } else {
          zoneLabelOverlay.setPosition(labelPos);
        }
      }
    }

    function onMessage(e){
      try {
        var data = JSON.parse(e.data);
        if (data.type === "set_pins") renderPins(data.pins);
        if (data.type === "set_center" && typeof data.lat === "number") {
          map.setCenter(new kakao.maps.LatLng(data.lat, data.lng));
        }
        if (data.type === "set_me" && typeof data.lat === "number") {
          renderMe(data.lat, data.lng, data.zone_radius || 0);
        }
        if (data.type === "set_level" && typeof data.level === "number") {
          map.setLevel(data.level);
        }
      } catch (err) {
        post({ type:"error", message: String(err) });
      }
    }
    document.addEventListener("message", onMessage); // Android WebView
    window.addEventListener("message", onMessage);   // iOS WKWebView

    // 빈 지도를 탭하면 열려 있던 상세 시트를 닫도록 RN 에 알린다.
    kakao.maps.event.addListener(map, "click", function(){ post({ type:"map_press" }); });

    post({ type:"ready" });
  });
}
</script>
</body>
</html>`;
}
