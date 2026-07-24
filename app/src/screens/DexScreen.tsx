import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { fetchDex, fetchDexCompletion } from '@/api/dex';
import { DexProgressHeader } from '@/components/dex/DexProgressHeader';
import { FilterChips, type DexFilter } from '@/components/dex/FilterChips';
import { SpeciesGridCard } from '@/components/dex/SpeciesGridCard';
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
    if (filter === '전체') return items;
    return items.filter((e) => e.group === filter);
  }, [dexQuery.data, filter]);

  const openCard = (entry: DexEntry) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('SpeciesCard', { speciesId: entry.species_id });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
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
        renderItem={({ item }) => (
          <SpeciesGridCard entry={item} onPress={openCard} />
        )}
        ListEmptyComponent={
          dexQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.emptyText}>이 분류에는 아직 발견한 친구가 없어요.</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 24 },
  column: { paddingHorizontal: 16, gap: 12, marginBottom: 12 },
  center: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
});
