import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { MAP_HTML_URL } from '@/api/map';
import type { MapPin } from '@/types/api';

export interface KakaoMapViewHandle {
  setPins: (pins: MapPin[]) => void;
  setCenter: (lat: number, lng: number) => void;
}

interface Props {
  onPinPress: (speciesId: string) => void;
}

/**
 * F11 실제 지도(카카오맵) — 네이티브 모듈 없이 WebView로 백엔드가 서빙하는
 * /map.html(카카오맵 JS SDK 임베드)을 띄운다. RN ↔ 페이지 간 데이터는
 * postMessage 브릿지로만 주고받는다(핀 목록 주입, 핀 클릭 이벤트 수신).
 */
export const KakaoMapView = forwardRef<KakaoMapViewHandle, Props>(function KakaoMapView(
  { onPinPress },
  ref,
) {
  const webviewRef = useRef<WebView>(null);
  const isReady = useRef(false);
  const pendingPins = useRef<MapPin[] | null>(null);

  const post = useCallback((msg: unknown) => {
    webviewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setPins: (pins: MapPin[]) => {
        if (!isReady.current) {
          pendingPins.current = pins;
          return;
        }
        post({ type: 'set_pins', pins });
      },
      setCenter: (lat: number, lng: number) => post({ type: 'set_center', lat, lng }),
    }),
    [post],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data) as { type: string; species_id?: string };
        if (data.type === 'ready') {
          isReady.current = true;
          if (pendingPins.current) {
            post({ type: 'set_pins', pins: pendingPins.current });
            pendingPins.current = null;
          }
        } else if (data.type === 'pin_press' && data.species_id) {
          onPinPress(data.species_id);
        }
      } catch {
        // 지도 페이지가 보낸 메시지 파싱 실패는 무시 — 앱 흐름을 깨면 안 됨.
      }
    },
    [onPinPress, post],
  );

  return (
    <WebView
      ref={webviewRef}
      source={{ uri: MAP_HTML_URL }}
      style={StyleSheet.absoluteFill}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
    />
  );
});
