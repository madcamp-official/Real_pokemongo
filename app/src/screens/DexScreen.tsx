import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { fetchDex, fetchDexCompletion } from '@/api/dex';
import { DexProgressHeader } from '@/components/dex/DexProgressHeader';
import { FilterChips, type DexFilter } from '@/components/dex/FilterChips';
import { SpeciesGridCard } from '@/components/dex/SpeciesGridCard';
import { ScreenHeader } from '@/components/nav/ScreenHeader';
import { colors } from '@/theme/colors';
import type { DexEntry } from '@/types/api';
import type { RootStackParamList } from '@/navigation/types';

/**
 * F5 도감 화면.
 * 완성도 헤더 + 분류 필터 + 3열 그리드(발견/미발견). 카드 탭 → 종 카드 상세.
 */
export default function DexScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [filter, setFilter] = useState<DexFilter>('전체');

  const dexQuery = useQuery({ queryKey: ['dex'], queryFn: fetchDex });
  const completionQuery = useQuery({ queryKey: ['dex', 'completion'], queryFn: fetchDexCompletion });

  const filtered = useMemo(() => {
    const items = dexQuery.data ?? [];
    const scoped = filter === '전체' ? items : items.filter((e) => e.group === filter);
    return [...scoped].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [dexQuery.data, filter]);

  const openCard = (entry: DexEntry) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('SpeciesCard', { speciesId: entry.species_id });
  };

  const openProfessor = () => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('Professor');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="도감" />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.species_id}
        numColumns={3}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <DexProgressHeader completion={completionQuery.data} />
            <FilterChips value={filter} onChange={setFilter} />
            <View style={{ height: 8 }} />
          </View>
        }
        renderItem={({ item, index }) => (
          <SpeciesGridCard entry={item} index={index} onPress={openCard} />
        )}
        ListEmptyComponent={
          dexQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : dexQuery.isError ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>도감 정보를 불러오지 못했어요.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="도감 다시 불러오기"
                style={styles.retryButton}
                onPress={() => void dexQuery.refetch()}
              >
                <Text style={styles.retryText}>다시 시도</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.emptyText}>이 분류에는 아직 발견한 친구가 없어요.</Text>
            </View>
          )
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="도감 박사에게 질문하기"
        style={[styles.professorFab, { bottom: Math.max(insets.bottom, 16) + 12 }]}
        onPress={openProfessor}
      >
        <Text style={styles.professorFabIcon}>?</Text>
        <Text style={styles.professorFabText}>박사</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 24 },
  column: { paddingHorizontal: 16, gap: 12, marginBottom: 12 },
  center: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  professorFab: {
    position: 'absolute',
    right: 18,
    minWidth: 78,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 26,
    backgroundColor: '#3E7456',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#203B2B',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  professorFabIcon: {
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    color: '#3E7456',
    textAlign: 'center',
    lineHeight: 23,
    fontSize: 15,
    fontWeight: '900',
  },
  professorFabText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
