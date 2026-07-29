import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { fetchMapHtml, KAKAO_ALLOWED_ORIGIN } from '@/api/map';
import { getMapExplorerImageDataUri } from '@/components/map/mapExplorerImage';
import { getMapPinImageDataUri } from '@/components/map/mapPinImages';
import { colors } from '@/theme/colors';
import type { MapPin } from '@/types/api';

const MAP_READY_TIMEOUT_MS = 12_000;

export interface KakaoMapViewHandle {
  setPins: (pins: MapPin[]) => void;
  setCenter: (lat: number, lng: number) => void;
  /** 카카오맵 레벨(작을수록 확대). */
  setZoomLevel: (level: number) => void;
  /** 현재 위치 점 + "나만의 탐험 구역" 점선 원(미터 단위 반지름). */
  setMe: (lat: number, lng: number, zoneRadiusM: number, zoneLabel?: string) => void;
}

interface Props {
  onPinPress: (speciesId: string) => void;
  /** 빈 지도를 탭했을 때(열려 있는 상세 시트 닫기 용도). */
  onMapPress?: () => void;
  /** 지도 페이지가 끝내 못 뜬 경우 — 상위에서 안내 UI를 띄운다. */
  onError?: (message: string) => void;
  /** 현재 좌표를 짧은 장소명으로 역지오코딩한 결과. */
  onLocationLabel?: (label: string) => void;
}

/**
 * F11 실제 지도(카카오맵) — 네이티브 모듈 없이 WebView 로 백엔드가 서빙하는
 * `/map.html`(카카오맵 JS SDK 임베드)을 띄운다. RN ↔ 페이지 사이는 postMessage
 * 브릿지로만 데이터를 주고받는다(핀 주입 · 현위치 갱신 · 핀 클릭 수신).
 *
 * 종 그림은 앱 번들의 assets/species가 단일 출처다. 작은 PNG data URI로 변환해
 * WebView의 https origin에서도 파일 권한이나 혼합 콘텐츠 문제없이 그리게 한다.
 */
export const KakaoMapView = forwardRef<KakaoMapViewHandle, Props>(function KakaoMapView(
  { onPinPress, onMapPress, onError, onLocationLabel },
  ref
) {
  const webviewRef = useRef<WebView>(null);
  const isReady = useRef(false);
  /** ready 이전에 들어온 명령은 모아뒀다가 준비되면 한 번에 흘려보낸다. */
  const pending = useRef<unknown[]>([]);
  /** 필터를 빠르게 바꿀 때 늦게 끝난 이전 이미지 변환 결과가 최신 핀을 덮지 않게 한다. */
  const pinRequestVersion = useRef(0);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState<string | null>(null);

  // 페이지를 URL 로 열면 Referer 가 LAN IP 가 되어 카카오가 401 로 막는다 —
  // HTML 을 받아와 등록된 origin 을 baseUrl 로 붙여 렌더한다(api/map.ts 주석 참고).
  useEffect(() => {
    let cancelled = false;
    fetchMapHtml()
      .then((text) => {
        if (!cancelled) setHtml(text);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        onError?.('map_html_fetch_failed');
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  // SDK/도메인/네트워크 문제로 페이지가 아무 메시지도 못 보내더라도 무한 로딩으로
  // 남기지 않는다. mapHtml 쪽 타임아웃과 별도로 네이티브 레이어에서도 방어한다.
  useEffect(() => {
    if (!html) return;
    readyTimer.current = setTimeout(() => {
      if (isReady.current) return;
      setLoading(false);
      onError?.('map_ready_timeout');
    }, MAP_READY_TIMEOUT_MS);
    return () => {
      if (readyTimer.current) clearTimeout(readyTimer.current);
      readyTimer.current = null;
    };
  }, [html, onError]);

  const post = useCallback((msg: unknown) => {
    if (!isReady.current) {
      pending.current.push(msg);
      return;
    }
    webviewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  // 탐험가 이미지는 GPS 좌표와 분리해 페이지에 한 번만 전달한다. 좌표가 자주
  // 갱신되어도 큰 base64 문자열을 반복 전송하지 않아 실기기 움직임이 끊기지 않는다.
  useEffect(() => {
    let cancelled = false;
    void getMapExplorerImageDataUri().then((imageUri) => {
      if (!cancelled && imageUri) {
        post({ type: 'set_explorer_image', image_uri: imageUri });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [post]);

  useImperativeHandle(
    ref,
    () => ({
      setPins: (pins: MapPin[]) => {
        const requestVersion = ++pinRequestVersion.current;
        void Promise.all(
          pins.map(async (pin) => ({
            ...pin,
            image_uri: await getMapPinImageDataUri(pin.species_id),
            // 신규 종이 앱 에셋보다 먼저 배포된 경우에만 쓰는 최후 폴백.
            marker_label: pin.species_name.trim().slice(0, 1) || '새',
          })),
        ).then((resolvedPins) => {
          if (requestVersion !== pinRequestVersion.current) return;
          post({ type: 'set_pins', pins: resolvedPins });
        });
      },
      setCenter: (lat: number, lng: number) => post({ type: 'set_center', lat, lng }),
      setZoomLevel: (level: number) => post({ type: 'set_level', level }),
      setMe: (lat: number, lng: number, zoneRadiusM: number, zoneLabel?: string) =>
        post({ type: 'set_me', lat, lng, zone_radius: zoneRadiusM, zone_label: zoneLabel }),
    }),
    [post]
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data) as {
          type: string;
          species_id?: string;
          message?: string;
          label?: string;
        };
        if (data.type === 'ready') {
          if (readyTimer.current) clearTimeout(readyTimer.current);
          readyTimer.current = null;
          isReady.current = true;
          setLoading(false);
          const queued = pending.current;
          pending.current = [];
          queued.forEach((msg) => webviewRef.current?.postMessage(JSON.stringify(msg)));
        } else if (data.type === 'pin_press' && data.species_id) {
          onPinPress(data.species_id);
        } else if (data.type === 'map_press') {
          onMapPress?.();
        } else if (data.type === 'location_label' && data.label) {
          onLocationLabel?.(data.label);
        } else if (data.type === 'error') {
          if (readyTimer.current) clearTimeout(readyTimer.current);
          readyTimer.current = null;
          setLoading(false);
          onError?.(data.message ?? 'unknown');
        }
      } catch {
        // 지도 페이지가 보낸 메시지 파싱 실패는 무시 — 앱 흐름을 깨면 안 됨.
      }
    },
    [onPinPress, onMapPress, onError, onLocationLabel]
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      {html && (
        <WebView
          ref={webviewRef}
          source={{ html, baseUrl: KAKAO_ALLOWED_ORIGIN }}
          originWhitelist={['*']}
          style={styles.web}
          onMessage={onMessage}
          onError={() => {
            setLoading(false);
            onError?.('webview_load_failed');
          }}
          javaScriptEnabled
          domStorageEnabled
          // 지도를 드래그·핀치하는 화면이라 스크롤 바운스는 방해만 된다.
          bounces={false}
          scrollEnabled={false}
          // 지도 페이지에는 개인정보가 없고 서버가 우리 것이라 캐시를 허용해 재진입을 빠르게.
          cacheEnabled
        />
      )}
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.loading]} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>지도를 펼치는 중...</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#E4EBDA' },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#E4EBDA',
  },
  loadingText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
});
