import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/colors';
import type { TaxonGroup } from '@/types/api';

export type DexFilter = '전체' | TaxonGroup;

const FILTERS: DexFilter[] = ['전체', '곤충', '식물', '조류', '기타'];

/**
 * 도감 분류 필터 칩 (F5). 활성 칩은 코랄 배경, 비활성은 흰 배경.
 */
interface Props {
  value: DexFilter;
  onChange: (f: DexFilter) => void;
}

export function FilterChips({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {FILTERS.map((f) => {
        const active = f === value;
        return (
          <Pressable
            key={f}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(f)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, gap: 10, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.onPrimary },
});
