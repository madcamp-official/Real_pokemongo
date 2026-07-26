import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { fetchMapPins, fetchExploredRegions } from '@/api/map';
import { KakaoMapView, type KakaoMapViewHandle } from '@/components/map/KakaoMapView';
import { useSettingsStore } from '@/store/settingsStore';
import { colors } from '@/theme/colors';
import type { RootStackParamList } from '@/navigation/types';

/**
 * F11 지도 & 탐험 기록.
 * 실제 카카오맵(WebView) 위에 발견 핀과 현재 위치를 표시한다.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const locationEnabled = useSettingsStore((s) => s.locationCollectionEnabled);
  const mapRef = useRef<KakaoMapViewHandle>(null);

  const pinsQuery = useQuery({ queryKey: ['map', 'pins'], queryFn: fetchMapPins });
  const regionsQuery = useQuery({ queryKey: ['map', 'regions'], queryFn: fetchExploredRegions });

  // 위치 수집이 꺼져 있으면 현재 위치는 숨긴다(프라이버시 설정 반영, 서버도 이미 null을
  // 주지만 클라이언트에서 한 번 더 확실히 가린다).
  const currentLocation = locationEnabled ? regionsQuery.data?.current_location ?? null : null;

  useEffect(() => {
    if (pinsQuery.data) mapRef.current?.setPins(pinsQuery.data);
  }, [pinsQuery.data]);

  useEffect(() => {
    if (currentLocation) mapRef.current?.setCenter(currentLocation.lat, currentLocation.lng);
  }, [currentLocation]);

  const onPinPress = (speciesId: string) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('SpeciesCard', { speciesId });
  };

  const isLoading = pinsQuery.isLoading || regionsQuery.isLoading;
  const isError = pinsQuery.isError || regionsQuery.isError;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>탐험 지도</Text>
      </View>

      {isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>지도를 불러오지 못했어요.</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              void pinsQuery.refetch();
              void regionsQuery.refetch();
            }}
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <KakaoMapView ref={mapRef} onPinPress={onPinPress} />
          {isLoading && (
            <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]} pointerEvents="none">
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </View>
      )}

      {!locationEnabled && (
        <View style={[styles.privacyWrap, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.privacyNote}>
            위치 수집이 꺼져 있어 현재 위치는 표시되지 않아요 (설정에서 변경)
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EAF2DE' },
  header: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#EAF2DE', zIndex: 2 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  mapWrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(234,242,222,0.6)',
  },
  errorText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  retryText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  privacyWrap: { paddingHorizontal: 16, paddingTop: 8 },
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
