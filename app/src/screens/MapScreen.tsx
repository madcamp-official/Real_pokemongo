import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { fetchMapPins, fetchExploredRegions, fetchWeeklyStats } from '@/api/map';
import { StylizedMap } from '@/components/map/StylizedMap';
import { WeeklyStatsCard } from '@/components/map/WeeklyStatsCard';
import { useSettingsStore } from '@/store/settingsStore';
import { colors } from '@/theme/colors';
import type { MapPin } from '@/types/api';
import type { RootStackParamList } from '@/navigation/types';

/**
 * F11 지도 & 탐험 기록.
 * 일러스트 스타일 지도에 발견 핀·탐험 구역·현재 위치를 표시하고, 이번 주 통계를 요약한다.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const locationEnabled = useSettingsStore((s) => s.locationCollectionEnabled);

  const pinsQuery = useQuery({ queryKey: ['map', 'pins'], queryFn: fetchMapPins });
  const regionsQuery = useQuery({ queryKey: ['map', 'regions'], queryFn: fetchExploredRegions });
  const statsQuery = useQuery({ queryKey: ['map', 'weekly'], queryFn: fetchWeeklyStats });

  const onPinPress = (pin: MapPin) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('SpeciesCard', { speciesId: pin.species_id });
  };

  const isLoading = pinsQuery.isLoading || regionsQuery.isLoading;

  // 위치 수집이 꺼져 있으면 현재 위치 점을 숨긴다(프라이버시 설정 반영).
  const currentLocation = locationEnabled ? regionsQuery.data?.current_location ?? null : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>탐험 지도</Text>
      </View>

      {isLoading || !regionsQuery.data ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <StylizedMap
          blobs={regionsQuery.data.blobs}
          pins={pinsQuery.data ?? []}
          homeZone={regionsQuery.data.home_zone}
          currentLocation={currentLocation}
          onPinPress={onPinPress}
        />
      )}

      <View style={[styles.statsWrap, { paddingBottom: insets.bottom + 12 }]}>
        {!locationEnabled && (
          <Text style={styles.privacyNote}>
            위치 수집이 꺼져 있어 현재 위치는 표시되지 않아요 (설정에서 변경)
          </Text>
        )}
        {statsQuery.data && <WeeklyStatsCard stats={statsQuery.data} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EAF2DE' },
  header: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#EAF2DE', zIndex: 2 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    gap: 8,
  },
  privacyNote: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'center',
    overflow: 'hidden',
  },
});
