import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchMapPins, fetchExploredRegions } from '@/api/map';
import { fetchDex } from '@/api/dex';
import { KakaoMapView, type KakaoMapViewHandle } from '@/components/map/KakaoMapView';
import { RadialMenu } from '@/components/nav/RadialMenu';
import { ProfessorEntryPoint } from '@/components/professor/ProfessorEntryPoint';
import { PinDetailSheet } from '@/components/map/PinDetailSheet';
import {
  requestLocationAndGet,
  watchForegroundLocation,
  type Coord,
  type StopLocationWatch,
} from '@/services/location';
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
  const hasInitiallyCentered = useRef(false);

  const [deviceLocation, setDeviceLocation] = useState<Coord | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [locationLabel, setLocationLabel] = useState('내 주변');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<MapPin['group'] | '전체'>('전체');
  const [wideArea, setWideArea] = useState(false);

  const pinsQuery = useQuery({ queryKey: ['map', 'pins'], queryFn: fetchMapPins });
  const regionsQuery = useQuery({ queryKey: ['map', 'regions'], queryFn: fetchExploredRegions });
  const dexQuery = useQuery({ queryKey: ['dex'], queryFn: fetchDex });

  const pins = useMemo(() => pinsQuery.data ?? [], [pinsQuery.data]);
  const visiblePins = useMemo(
    () => (selectedGroup === '전체' ? pins : pins.filter((pin) => pin.group === selectedGroup)),
    [pins, selectedGroup]
  );

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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let stopWatching: StopLocationWatch | null = null;

      void watchForegroundLocation((coord) => {
        if (!active) return;
        setDeviceLocation(coord);
        setLocationDenied(false);
      }).then((stop) => {
        if (!active) {
          stop?.();
          return;
        }
        stopWatching = stop;
        if (!stop) setLocationDenied(true);
      });

      return () => {
        active = false;
        stopWatching?.();
      };
    }, []),
  );

  const currentLocation = deviceLocation ?? regionsQuery.data?.current_location ?? null;

  // 지도 페이지로 데이터 주입 — WebView 가 ready 이전이면 내부에서 큐잉된다.
  useEffect(() => {
    mapRef.current?.setPins(visiblePins);
  }, [visiblePins]);

  useEffect(() => {
    if (!currentLocation) return;
    mapRef.current?.setMe(currentLocation.lat, currentLocation.lng, HOME_ZONE_RADIUS_M, locationLabel);
  }, [currentLocation, locationLabel]);

  // 실시간 GPS 갱신 때마다 지도를 강제로 중앙으로 당기면 사용자의 드래그가 깨진다.
  // 첫 유효 위치에서만 자동 중앙 정렬하고 이후에는 탐험가만 부드럽게 이동시킨다.
  useEffect(() => {
    if (!currentLocation || hasInitiallyCentered.current) return;
    if (!deviceLocation && !locationDenied) return;
    hasInitiallyCentered.current = true;
    mapRef.current?.setCenter(currentLocation.lat, currentLocation.lng);
  }, [currentLocation, deviceLocation, locationDenied]);

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

  const openProfessor = () => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('Professor');
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

  const toggleArea = () => {
    const nextWideArea = !wideArea;
    setWideArea(nextWideArea);
    mapRef.current?.setZoomLevel(nextWideArea ? 5 : 3);
  };

  const isOffline = pinsQuery.isError || regionsQuery.isError;
  const mapErrorText =
    mapError === 'map_html_fetch_failed'
      ? '🗺️ 지도 서버에 연결하지 못했어요'
      : '🗺️ 카카오 지도를 불러오지 못했어요 · 잠시 후 다시 시도해 주세요';

  return (
    <View style={styles.root}>
      <KakaoMapView
        ref={mapRef}
        onPinPress={onPinPress}
        onMapPress={() => setSelectedPin(null)}
        onError={setMapError}
        onLocationLabel={setLocationLabel}
      />

      {/* 밀도 높은 지도 라벨과 헤더가 부딪히지 않도록 상단만 부드럽게 걷어낸다. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(250,248,239,0.98)', 'rgba(245,247,232,0.82)', 'rgba(245,247,232,0)']}
        locations={[0, 0.58, 1]}
        style={[styles.topWash, { height: insets.top + 172 }]}
      />

      {/* 좌상단: 타이틀 + 이번 주/지도 기록 요약 */}
      <View pointerEvents="box-none" style={[styles.topLeft, { top: insets.top + 14 }]}>
        <Text style={styles.title}>탐험 지도</Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>
            이번 주 <Text style={styles.chipAccent}>{weekCount}종</Text> 발견
          </Text>
        </View>
        {pinsQuery.isSuccess && pins.length === 0 && (
          <Text style={styles.emptyHint}>위치를 허용하고 관찰하면 여기에 기록돼요</Text>
        )}
      </View>

      {/* 지도 조작은 같은 형태의 원형 컨트롤 레일로 모은다.
          설정은 하단 자연 메뉴에만 두고 지도 위 중복 버튼은 표시하지 않는다. */}
      <View pointerEvents="box-none" style={[styles.controlRail, { top: insets.top + 18 }]}>
        <Pressable
          onPress={recenter}
          accessibilityRole="button"
          accessibilityLabel="내 위치로 이동"
          style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}
        >
          <View style={styles.locateGlyph}>
            <View style={styles.locateDot} />
          </View>
        </Pressable>
        <Pressable
          onPress={toggleArea}
          accessibilityRole="button"
          accessibilityLabel={wideArea ? '가까이 보기' : '넓게 보기'}
          style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}
        >
          <Text style={styles.controlIcon}>◇</Text>
        </Pressable>
        <Pressable
          onPress={() => setFilterOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel="관찰 분류 필터"
          style={({ pressed }) => [styles.controlButton, filterOpen && styles.controlButtonActive, pressed && styles.pressed]}
        >
          <Text style={styles.controlIcon}>⌄</Text>
        </Pressable>
      </View>

      {filterOpen && (
        <View style={[styles.filterPanel, { top: insets.top + 178 }]}>
          {(['전체', '조류', '곤충', '식물', '양서류', '기타'] as const).map((group) => (
            <Pressable
              key={group}
              onPress={() => {
                setSelectedGroup(group);
                setFilterOpen(false);
              }}
              style={[styles.filterChip, selectedGroup === group && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, selectedGroup === group && styles.filterTextActive]}>{group}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* 상태 안내 */}
      {(mapError || isOffline || locationDenied) && (
        <View pointerEvents="none" style={[styles.notices, { top: insets.top + 142 }]}>
          {mapError && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{mapErrorText}</Text>
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

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(250,252,247,0)', 'rgba(250,252,247,0.93)', '#FAFCF7']}
        locations={[0, 0.44, 1]}
        style={styles.bottomWash}
      />
      <View pointerEvents="none" style={[styles.nearbySummary, { bottom: insets.bottom + 21 }]}>
        <Text style={styles.nearbyEyebrow}>{selectedGroup === '전체' ? locationLabel : `${selectedGroup} 관찰`}</Text>
        <Text style={styles.nearbyTitle}>내 주변 관찰 {visiblePins.length}건</Text>
      </View>

      {/* 앱 첫 화면에서도 새 기능을 바로 찾을 수 있는 상시 진입점. */}
      <ProfessorEntryPoint
        onPress={openProfessor}
        style={[styles.professorShortcut, { bottom: insets.bottom + 112 }]}
      />

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
  root: { flex: 1, backgroundColor: colors.background },

  topWash: { position: 'absolute', top: 0, left: 0, right: 0 },
  topLeft: { position: 'absolute', left: 26, alignItems: 'flex-start', gap: 9 },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: INK,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 0,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  chipText: { fontSize: 15, fontWeight: '700', color: '#4B5248' },
  chipAccent: { color: colors.accent, fontWeight: '900' },
  emptyHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#667161',
    paddingLeft: 4,
  },

  controlRail: { position: 'absolute', right: 18, alignItems: 'center', gap: 9 },
  controlButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#30452D',
    shadowOpacity: 0.16,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  controlButtonActive: { backgroundColor: '#E8F2DE' },
  locateGlyph: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: '#527A4E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#527A4E',
  },
  controlIcon: { fontSize: 28, lineHeight: 31, fontWeight: '700', color: '#242322' },
  pressed: { opacity: 0.7 },

  filterPanel: {
    position: 'absolute',
    right: 18,
    width: 96,
    padding: 7,
    gap: 4,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#30452D',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  filterChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  filterChipActive: { backgroundColor: '#2F7658' },
  filterText: { fontSize: 12, fontWeight: '800', color: '#536052', textAlign: 'center' },
  filterTextActive: { color: '#fff' },

  notices: { position: 'absolute', left: 14, right: 14, gap: 6 },
  notice: {
    backgroundColor: INK,
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noticeText: { color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 17 },

  bottomWash: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  nearbySummary: { position: 'absolute', left: 26, gap: 5 },
  nearbyEyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2, color: '#667062' },
  nearbyTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.35, color: INK },

  professorShortcut: {
    position: 'absolute',
    right: 18,
    zIndex: 19,
  },
});
