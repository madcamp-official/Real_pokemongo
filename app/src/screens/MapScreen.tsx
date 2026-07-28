import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { fetchMapPins, fetchExploredRegions } from '@/api/map';
import { fetchDex } from '@/api/dex';
import { KakaoMapView, type KakaoMapViewHandle } from '@/components/map/KakaoMapView';
import { RadialMenu } from '@/components/nav/RadialMenu';
import { PinDetailSheet } from '@/components/map/PinDetailSheet';
import { requestLocationAndGet, type Coord } from '@/services/location';
import { colors } from '@/theme/colors';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';
import type { MapPin } from '@/types/api';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** "나만의 탐험 구역" 반지름(m). 아이 도보 반경 정도로 잡는다. */
const HOME_ZONE_RADIUS_M = 300;

/**
 * F11 지도 & 탐험 기록 — 앱의 홈 화면.
 *
 * 실제 카카오맵(WebView) 위에 발견 핀·현재 위치를 얹고, 상단엔 이번 주 요약 칩을,
 * 하단 중앙엔 방사형 메뉴 엠블럼을 둔다. 핀을 누르면 종 상세 시트가 올라온다.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const mapRef = useRef<KakaoMapViewHandle>(null);

  const [deviceLocation, setDeviceLocation] = useState<Coord | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);

  const pinsQuery = useQuery({ queryKey: ['map', 'pins'], queryFn: fetchMapPins });
  const regionsQuery = useQuery({ queryKey: ['map', 'regions'], queryFn: fetchExploredRegions });
  const dexQuery = useQuery({ queryKey: ['dex'], queryFn: fetchDex });

  const pins = useMemo(() => pinsQuery.data ?? [], [pinsQuery.data]);

  // 현재 위치는 기기 GPS 에서 직접 읽는다. 서버의 explored-regions.current_location 은
  // "마지막 관찰이 있었던 곳"이라 지금 서 있는 자리가 아니다(관찰이 없으면 늘 null).
  // 이 좌표는 지도에 그리기만 하고 서버로 보내지 않는다(촬영 시 첨부 경로와 별개).
  const readLocation = useCallback(() => {
    let cancelled = false;
    void requestLocationAndGet().then((coord) => {
      if (cancelled) return;
      if (coord) {
        setDeviceLocation(coord);
        setLocationDenied(false);
      } else {
        setLocationDenied(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(readLocation);

  const currentLocation = deviceLocation ?? regionsQuery.data?.current_location ?? null;

  // 지도 페이지로 데이터 주입 — WebView 가 ready 이전이면 내부에서 큐잉된다.
  useEffect(() => {
    mapRef.current?.setPins(pins);
  }, [pins]);

  useEffect(() => {
    if (!currentLocation) return;
    mapRef.current?.setMe(currentLocation.lat, currentLocation.lng, HOME_ZONE_RADIUS_M);
    mapRef.current?.setCenter(currentLocation.lat, currentLocation.lng);
  }, [currentLocation]);

  const weekCount = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    return (dexQuery.data ?? []).filter(
      (e) =>
        e.discovered &&
        e.creatures.some((c) => {
          const t = Date.parse(c.discovered_at);
          return !Number.isNaN(t) && t >= since;
        })
    ).length;
  }, [dexQuery.data]);

  const openSpeciesCard = (speciesId: string) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('SpeciesCard', { speciesId });
  };

  const onPinPress = useCallback(
    (speciesId: string) => {
      setSelectedPin(pins.find((p) => p.species_id === speciesId) ?? null);
    },
    [pins]
  );

  const recenter = () => {
    if (currentLocation) {
      mapRef.current?.setCenter(currentLocation.lat, currentLocation.lng);
    } else {
      readLocation();
    }
  };

  const isOffline = pinsQuery.isError || regionsQuery.isError;

  return (
    <View style={styles.root}>
      <KakaoMapView
        ref={mapRef}
        onPinPress={onPinPress}
        onMapPress={() => setSelectedPin(null)}
        onError={setMapError}
      />

      {/* 좌상단: 타이틀 + 이번 주 요약 칩 */}
      <View pointerEvents="box-none" style={[styles.topLeft, { top: insets.top + 10 }]}>
        <Text style={styles.title}>탐험 지도</Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>
            이번 주 · <Text style={styles.chipAccent}>{weekCount}종</Text> 발견
          </Text>
        </View>
      </View>

      {/* 우상단: 설정 진입점 */}
      <View pointerEvents="box-none" style={[styles.topRight, { top: insets.top + 10 }]}>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel="설정"
          style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}
        >
          <Text style={styles.squareButtonIcon}>⚙︎</Text>
        </Pressable>
      </View>

      {/* 상태 안내 */}
      {(mapError || isOffline || locationDenied) && (
        <View pointerEvents="none" style={[styles.notices, { top: insets.top + 96 }]}>
          {mapError && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                🗺️ 지도를 불러오지 못했어요 · 카카오 개발자 콘솔에 이 주소가 Web 플랫폼으로
                등록됐는지 확인해 주세요
              </Text>
            </View>
          )}
          {isOffline && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>📡 서버에 연결하지 못했어요 · 기록은 안전해요</Text>
            </View>
          )}
          {locationDenied && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>📍 위치 권한이 없어 현재 위치를 표시할 수 없어요</Text>
            </View>
          )}
        </View>
      )}

      {/* 내 위치로 되돌리기 */}
      <Pressable
        onPress={recenter}
        accessibilityRole="button"
        accessibilityLabel="내 위치로 이동"
        style={({ pressed }) => [
          styles.recenter,
          { bottom: insets.bottom + 116 },
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.recenterIcon}>◎</Text>
      </Pressable>

      <RadialMenu />

      <PinDetailSheet
        pin={selectedPin}
        onClose={() => setSelectedPin(null)}
        onOpenCard={(speciesId) => {
          setSelectedPin(null);
          openSpeciesCard(speciesId);
        }}
      />
    </View>
  );
}

const INK = '#201E1D';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E4EBDA' },

  topLeft: { position: 'absolute', left: 18, alignItems: 'flex-start', gap: 9 },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: INK,
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowRadius: 6,
  },
  chip: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: INK },
  chipAccent: { color: colors.primary, fontWeight: '900' },

  topRight: { position: 'absolute', right: 14, alignItems: 'flex-end', gap: 9 },
  squareButton: {
    width: 46,
    height: 46,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareButtonIcon: { fontSize: 25, color: INK, fontWeight: '600' },
  pressed: { opacity: 0.7 },

  notices: { position: 'absolute', left: 14, right: 14, gap: 6 },
  notice: {
    backgroundColor: INK,
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noticeText: { color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 17 },

  recenter: {
    position: 'absolute',
    right: 16,
    width: 50,
    height: 50,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterIcon: { fontSize: 24, color: '#2B6FE0', fontWeight: '900' },
});
