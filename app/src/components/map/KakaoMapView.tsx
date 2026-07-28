import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { fetchMapHtml, KAKAO_ALLOWED_ORIGIN } from '@/api/map';
import { getSpeciesVisual } from '@/theme/species';
import { colors } from '@/theme/colors';
import type { MapPin } from '@/types/api';

const MAP_READY_TIMEOUT_MS = 12_000;

export interface KakaoMapViewHandle {
  setPins: (pins: MapPin[]) => void;
  setCenter: (lat: number, lng: number) => void;
  /** 현재 위치 점 + "나만의 탐험 구역" 점선 원(미터 단위 반지름). */
  setMe: (lat: number, lng: number, zoneRadiusM: number) => void;
}

interface Props {
  onPinPress: (speciesId: string) => void;
  /** 빈 지도를 탭했을 때(열려 있는 상세 시트 닫기 용도). */
  onMapPress?: () => void;
  /** 지도 페이지가 끝내 못 뜬 경우 — 상위에서 안내 UI를 띄운다. */
  onError?: (message: string) => void;
}

/**
 * F11 실제 지도(카카오맵) — 네이티브 모듈 없이 WebView 로 백엔드가 서빙하는
 * `/map.html`(카카오맵 JS SDK 임베드)을 띄운다. RN ↔ 페이지 사이는 postMessage
 * 브릿지로만 데이터를 주고받는다(핀 주입 · 현위치 갱신 · 핀 클릭 수신).
 *
 * 종 그림(이모지)은 앱이 알고 있으므로 핀을 넘길 때 함께 실어 보낸다 —
 * 서버가 종별 비주얼을 따로 관리하지 않게 하려는 의도(단일 출처는 theme/species).
 */
export const KakaoMapView = forwardRef<KakaoMapViewHandle, Props>(function KakaoMapView(
  { onPinPress, onMapPress, onError },
  ref
) {
  const webviewRef = useRef<WebView>(null);
  const isReady = useRef(false);
  /** ready 이전에 들어온 명령은 모아뒀다가 준비되면 한 번에 흘려보낸다. */
  const pending = useRef<unknown[]>([]);
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

  useImperativeHandle(
    ref,
    () => ({
      setPins: (pins: MapPin[]) =>
        post({
          type: 'set_pins',
          pins: pins.map((p) => ({ ...p, emoji: getSpeciesVisual(p.species_id).emoji })),
        }),
      setCenter: (lat: number, lng: number) => post({ type: 'set_center', lat, lng }),
      setMe: (lat: number, lng: number, zoneRadiusM: number) =>
        post({ type: 'set_me', lat, lng, zone_radius: zoneRadiusM }),
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
    [onPinPress, onMapPress, onError]
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
