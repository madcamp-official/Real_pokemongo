import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { fetchMapPins, fetchExploredRegions } from '@/api/map';
import { fetchDex } from '@/api/dex';
import { ExploreMapCanvas } from '@/components/map/ExploreMapCanvas';
import { RadialMenu } from '@/components/nav/RadialMenu';
import { requestLocationAndGet, type Coord } from '@/services/location';
import { env } from '@/config/env';
import { colors } from '@/theme/colors';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * F11 지도 & 탐험 기록 — 앱의 홈 화면.
 * 일러스트 지도 위에 발견 핀·현재 위치를 얹고, 하단에 이번 주 탐험 요약을 보여준다.
 * 화면 이동은 하단 중앙 엠블럼(RadialMenu)이 담당한다.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  const [deviceLocation, setDeviceLocation] = useState<Coord | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  const pinsQuery = useQuery({ queryKey: ['map', 'pins'], queryFn: fetchMapPins });
  const regionsQuery = useQuery({ queryKey: ['map', 'regions'], queryFn: fetchExploredRegions });
  const dexQuery = useQuery({ queryKey: ['dex'], queryFn: fetchDex });

  // 현재 위치는 기기 GPS에서 직접 읽는다. 서버의 explored-regions.current_location 은
  // "마지막 관찰이 있었던 곳"이라 지금 내가 서 있는 자리가 아니고, 관찰이 하나도 없으면
  // 늘 null 이었다 — 그래서 지도에 내 위치가 영영 안 떴다.
  // 이 좌표는 화면에 그리기만 하고 서버로 보내지 않는다(촬영 시 첨부하는 경로와 별개).
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

  // 지도로 돌아올 때마다 갱신한다(촬영하러 갔다 오면 위치가 달라져 있을 수 있다).
  useFocusEffect(readLocation);

  // 기기 GPS가 우선, 못 얻으면 서버가 아는 마지막 관찰 위치로 폴백.
  const currentLocation = deviceLocation ?? regionsQuery.data?.current_location ?? null;
  const pins = pinsQuery.data ?? [];

  const stats = useMemo(() => {
    const entries = dexQuery.data ?? [];
    const discovered = entries.filter((e) => e.discovered);
    const since = Date.now() - WEEK_MS;
    const thisWeek = discovered.filter((e) =>
      e.creatures.some((c) => {
        const t = Date.parse(c.discovered_at);
        return !Number.isNaN(t) && t >= since;
      })
    );
    return { places: pins.length, newThisWeek: thisWeek.length, collected: discovered.length };
  }, [dexQuery.data, pins.length]);

  const openSpecies = (speciesId: string) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('SpeciesCard', { speciesId });
  };

  const isLoading = pinsQuery.isLoading || regionsQuery.isLoading;
  // 서버에 못 닿아도 지도는 그대로 보여준다 — 빈 지도가 에러 화면보다 덜 막막하다.
  const isOffline = pinsQuery.isError || regionsQuery.isError;

  return (
    <View style={styles.root}>
      <ExploreMapCanvas
        pins={pins}
        currentLocation={currentLocation}
        onPinPress={openSpecies}
      />

      {/* 상단: 타이틀 + 보상함 바로가기 */}
      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 12 }]}>
        <Text style={styles.title}>탐험 지도</Text>
        <Pressable
          onPress={() => navigation.navigate('Rewards')}
          accessibilityRole="button"
          accessibilityLabel="보상함"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Text style={styles.iconButtonIcon}>🏆</Text>
        </Pressable>
      </View>

      {/* 상태 칩 */}
      {(isLoading || isOffline || locationDenied) && (
        <View pointerEvents="none" style={[styles.chips, { top: insets.top + 62 }]}>
          {isLoading && (
            <View style={styles.chip}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.chipText}>탐험 기록을 불러오는 중...</Text>
            </View>
          )}
          {isOffline && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                📡 서버에 연결하지 못했어요 · 기록은 안전해요
                {/* 개발 빌드에서만: 실기기가 실제로 어느 주소를 보고 있는지 눈으로 확인 */}
                {__DEV__ ? `\n${env.API_BASE_URL}` : ''}
              </Text>
            </View>
          )}
          {locationDenied && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>📍 위치 권한이 없어 현재 위치를 표시할 수 없어요</Text>
            </View>
          )}
        </View>
      )}

      {/* 이번 주 탐험 요약 */}
      <View pointerEvents="box-none" style={[styles.summaryWrap, { bottom: insets.bottom + 104 }]}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>이번 주 탐험</Text>
          <View style={styles.summaryRow}>
            <Stat value={stats.places} unit="곳" label="발견 장소" color={colors.primary} />
            <Stat value={stats.newThisWeek} unit="종" label="새 친구" color="#4FA3D9" />
            <Stat value={stats.collected} unit="종" label="모은 친구" color="#6BAE5A" />
          </View>
          {pins.length === 0 && !isLoading && (
            <Text style={styles.emptyNote}>
              아직 기록된 발견 장소가 없어요 · 첫 친구를 찾아 떠나볼까요?
            </Text>
          )}
        </View>
      </View>

      <RadialMenu />
    </View>
  );
}

function Stat({
  value,
  unit,
  label,
  color,
}: {
  value: number;
  unit: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>
        {value}
        <Text style={styles.statUnit}>{unit}</Text>
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF5E2' },

  topBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 27,
    fontWeight: '900',
    color: colors.textPrimary,
    textShadowColor: 'rgba(255,255,255,0.85)',
    textShadowRadius: 6,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  iconButtonIcon: { fontSize: 22 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },

  chips: { position: 'absolute', left: 20, right: 20, alignItems: 'flex-start', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  summaryWrap: { position: 'absolute', left: 16, right: 16 },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 26, fontWeight: '900' },
  statUnit: { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  emptyNote: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
});
