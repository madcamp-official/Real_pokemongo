/**
 * WebView 가 로드하는 카카오맵 페이지 (F11).
 *
 * 실제 카카오맵 타일 위에 자연 관찰 앱 전용 연출을 얹는다:
 *   - 타일에 CSS 필터를 걸어 온화한 녹색/세피아 톤으로 맞춘다
 *     (카카오맵 JS SDK 는 구글맵처럼 타일 스타일 커스터마이즈를 지원하지 않아,
 *      색보정은 이 방법이 사실상 유일하다)
 *   - 발견 핀은 기본 마커 대신 분류색 원형 CustomOverlay 로 그린다.
 *     아이콘이 없는 종은 이름 첫 글자로, 같은 좌표의 핀은 작은 원형으로 펼쳐 보인다.
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
  조류: "#6D8F72",
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

  /* 카카오 타일을 자연 관찰 앱의 온화한 녹색/세피아 톤으로 맞춘다.
     지도 위에 얹는 오버레이(핀·현위치)는 이 필터를 받지 않아야 색이 죽지 않으므로,
     필터는 타일 컨테이너에만 걸고 오버레이는 필터 밖 레이어에 그린다. */
  #map > div > div:first-child {
    filter:sepia(.10) saturate(.72) hue-rotate(34deg) brightness(1.07) contrast(.88);
  }

  /* 실패 안내는 RN 쪽 배너가 담당한다(페이지 상단에 그리면 앱 타이틀과 겹친다) —
     여기서는 배경만 남기고 숨긴다. 실패 사실은 postMessage 로 RN 에 전달된다. */
  #error{display:none;}

  /* ── 발견 핀 ─────────────────────────────────────────────── */
  .pin{position:relative;cursor:pointer;padding:4px;transform:translateY(-2px);}
  .pin-marker{position:relative;width:43px;height:43px;border-radius:50%;
    background:rgba(255,255,255,.98);border:3px solid #6BAE5A;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 5px 14px rgba(45,65,40,.25);}
  .pin-body{width:31px;height:31px;border-radius:50%;display:flex;
    align-items:center;justify-content:center;font-size:18px;line-height:1;}
  .pin-initial{font-size:14px;font-weight:900;color:#344832;}
  .pin-tail{width:9px;height:9px;margin:-8px auto 0;background:#fff;
    border-right:3px solid;border-bottom:3px solid;transform:rotate(45deg);}
  .pin-danger{position:absolute;top:-7px;right:-7px;width:18px;height:18px;
    border-radius:9px;background:#C0453B;color:#fff;border:2px solid #fff;
    font-size:11px;font-weight:900;line-height:16px;text-align:center;
    box-shadow:0 2px 5px rgba(0,0,0,.24);}

  /* ── 현재 위치 ───────────────────────────────────────────── */
  .me{position:relative;width:0;height:0;}
  .me-dot{position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;
    box-sizing:border-box;background:#3478C8;border:4px solid #fff;
    box-shadow:0 3px 9px rgba(39,77,119,.32);}
  .me-ring{position:absolute;left:-36px;top:-36px;width:72px;height:72px;border-radius:50%;
    background:rgba(52,120,200,.20);animation:pulsering 2.8s ease-out infinite;}
  .me-caption{position:absolute;top:18px;left:50%;transform:translateX(-50%);
    padding:4px 8px;border-radius:11px;background:rgba(255,255,255,.94);
    color:#315679;font-size:10px;font-weight:800;white-space:nowrap;
    box-shadow:0 2px 7px rgba(39,77,119,.16);}
  @keyframes pulsering{0%{transform:scale(.35);opacity:.55;}70%{opacity:0;}100%{transform:scale(1);opacity:0;}}

  /* 참조 시안의 탐험 구역 캡션. Circle 자체에는 라벨 기능이 없어서 같은 좌표계를
     쓰는 CustomOverlay로 붙인다. 지도 확대/이동에도 원과 함께 자연스럽게 움직인다. */
  .zone-label{position:relative;background:#668A61;color:#fff;padding:7px 13px;
    border-radius:15px;
    font-size:13px;font-weight:800;white-space:nowrap;letter-spacing:.1px;
    box-shadow:0 4px 12px rgba(52,82,48,.25);}
  .zone-label:after{content:'';position:absolute;left:50%;bottom:-11px;margin-left:-8px;
    border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid #668A61;}
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
  src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false&libraries=services"
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
    var latestPins = [];
    var mePosition = null;
    var meOverlay = null;
    var zoneCircle = null;
    var zoneLabelOverlay = null;
    var zoneLabelElement = null;
    var lastLabelKey = null;
    var geocoder = new kakao.maps.services.Geocoder();

    function clearPins(){
      pinOverlays.forEach(function(o){ o.setMap(null); });
      pinOverlays = [];
    }

    function pinElement(pin, index){
      var color = GROUP_COLORS[pin.group] || GROUP_COLORS["기타"];
      var wrap = document.createElement("div");
      wrap.className = "pin";
      wrap.setAttribute("aria-label", pin.species_name || "관찰 기록");
      wrap.title = pin.species_name || "관찰 기록";

      var marker = document.createElement("div");
      marker.className = "pin-marker";
      marker.style.borderColor = color;

      var body = document.createElement("div");
      body.className = "pin-body";
      body.style.background = color + "22";
      if (pin.emoji) {
        body.textContent = pin.emoji;
      } else {
        body.className += " pin-initial";
        body.textContent = pin.marker_label || "새";
      }

      marker.appendChild(body);

      if (pin.is_dangerous) {
        var badge = document.createElement("div");
        badge.className = "pin-danger";
        badge.textContent = "!";
        marker.appendChild(badge);
      }

      var tail = document.createElement("div");
      tail.className = "pin-tail";
      tail.style.borderColor = color;

      wrap.appendChild(marker);
      wrap.appendChild(tail);
      wrap.addEventListener("click", function(e){
        e.stopPropagation();
        post({ type:"pin_press", species_id: pin.species_id });
      });
      return wrap;
    }

    function isNearMe(pin){
      if (!mePosition) return false;
      var latM = (pin.lat - mePosition.lat) * 111000;
      var lngM = (pin.lng - mePosition.lng) * 111000 *
        Math.cos(pin.lat * Math.PI / 180);
      return Math.sqrt(latM * latM + lngM * lngM) < 12;
    }

    function displayPosition(pin, clusterIndex, clusterSize){
      var avoidMe = isNearMe(pin);
      if (clusterSize === 1 && !avoidMe) {
        return new kakao.maps.LatLng(pin.lat, pin.lng);
      }

      // 같은 촬영 지점의 여러 종은 그대로 겹치면 마지막 한 개만 보인다.
      // 실제 저장 좌표는 바꾸지 않고, 지도 표시만 작은 원형으로 펼친다.
      var slots = Math.min(clusterSize, 8);
      var ring = Math.floor(clusterIndex / 8);
      var radiusM = 22 + ring * 13;
      var angle = -Math.PI / 2 + (clusterIndex % 8) * (Math.PI * 2 / slots);
      if (clusterSize === 1 && avoidMe) angle = -0.55;
      var northM = Math.cos(angle) * radiusM;
      var eastM = Math.sin(angle) * radiusM;
      var lat = pin.lat + northM / 111000;
      var lng = pin.lng + eastM /
        (111000 * Math.max(0.2, Math.cos(pin.lat * Math.PI / 180)));
      return new kakao.maps.LatLng(lat, lng);
    }

    function renderPins(pins){
      latestPins = pins || [];
      clearPins();
      var clusters = {};
      latestPins.forEach(function(pin, i){
        // 약 1m 이내 좌표를 같은 촬영 지점으로 묶는다.
        var key = Number(pin.lat).toFixed(5) + ":" + Number(pin.lng).toFixed(5);
        if (!clusters[key]) clusters[key] = [];
        clusters[key].push({ pin: pin, sourceIndex: i });
      });

      Object.keys(clusters).forEach(function(key){
        var cluster = clusters[key].sort(function(a, b){
          return String(a.pin.species_id).localeCompare(String(b.pin.species_id));
        });
        cluster.forEach(function(entry, clusterIndex){
          var overlay = new kakao.maps.CustomOverlay({
            position: displayPosition(entry.pin, clusterIndex, cluster.length),
            content: pinElement(entry.pin, entry.sourceIndex),
            yAnchor: 1,
            clickable: true,
            zIndex: 10 + entry.sourceIndex,
          });
          overlay.setMap(map);
          pinOverlays.push(overlay);
        });
      });
    }

    function shortLocationLabel(lat, lng){
      // 시연 기본 위치인 KAIST 내부는 행정동보다 더 알아보기 쉬운 캠퍼스명으로 표시한다.
      var kaistLat = 36.3725, kaistLng = 127.3605;
      var northM = (lat - kaistLat) * 111000;
      var eastM = (lng - kaistLng) * 111000 * Math.cos(lat * Math.PI / 180);
      if (Math.sqrt(northM * northM + eastM * eastM) < 1250) return "KAIST 캠퍼스";
      return null;
    }

    function resolveLocationLabel(lat, lng){
      var key = lat.toFixed(4) + ":" + lng.toFixed(4);
      if (key === lastLabelKey) return;
      lastLabelKey = key;
      var known = shortLocationLabel(lat, lng);
      if (known) { post({ type:"location_label", label: known }); return; }
      geocoder.coord2RegionCode(lng, lat, function(result, status){
        if (status !== kakao.maps.services.Status.OK || !result || !result.length) return;
        var region = result.find(function(item){ return item.region_type === "H"; }) || result[0];
        var parts = [region.region_2depth_name, region.region_3depth_name].filter(Boolean);
        post({ type:"location_label", label: parts.join(" ") || region.address_name || "내 주변" });
      });
    }

    function renderMe(lat, lng, zoneRadius, zoneLabel){
      var pos = new kakao.maps.LatLng(lat, lng);
      mePosition = { lat: lat, lng: lng };
      resolveLocationLabel(lat, lng);
      if (!meOverlay) {
        var el = document.createElement("div");
        el.className = "me";
        var ring = document.createElement("div"); ring.className = "me-ring";
        var dot = document.createElement("div"); dot.className = "me-dot";
        var caption = document.createElement("div"); caption.className = "me-caption";
        caption.textContent = "현재 위치";
        el.appendChild(ring); el.appendChild(dot); el.appendChild(caption);
        meOverlay = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 5 });
        meOverlay.setMap(map);
      } else {
        meOverlay.setPosition(pos);
      }

      // 현위치와 같은 좌표의 관찰 핀은 파란 점 위에 겹치지 않게 다시 펼친다.
      if (latestPins.length) renderPins(latestPins);

      // "나만의 탐험 구역" — 현재 위치를 감싸는 점선 원.
      if (zoneRadius > 0) {
        if (!zoneCircle) {
          zoneCircle = new kakao.maps.Circle({
            center: pos, radius: zoneRadius,
            strokeWeight: 3, strokeColor: "#668A61", strokeOpacity: .78, strokeStyle: "dashed",
            fillColor: "#88A77E", fillOpacity: 0.08,
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
          label.textContent = zoneLabel ? zoneLabel + " 탐험 구역" : "나만의 탐험 구역";
          zoneLabelElement = label;
          zoneLabelOverlay = new kakao.maps.CustomOverlay({
            position: labelPos, content: label, yAnchor: 1, zIndex: 6,
          });
          zoneLabelOverlay.setMap(map);
        } else {
          zoneLabelOverlay.setPosition(labelPos);
          if (zoneLabelElement) zoneLabelElement.textContent = zoneLabel ? zoneLabel + " 탐험 구역" : "나만의 탐험 구역";
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
          renderMe(data.lat, data.lng, data.zone_radius || 0, data.zone_label);
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
