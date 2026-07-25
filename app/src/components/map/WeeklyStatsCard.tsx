import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { WeeklyExploreStats } from '@/types/api';

/**
 * 이번 주 탐험 요약 카드 (F11).
 */
interface Props {
  stats: WeeklyExploreStats;
}

export function WeeklyStatsCard({ stats }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>이번 주 탐험</Text>
      <View style={styles.row}>
        <Stat value={`${stats.places_discovered}곳`} label="발견 장소" color={colors.primary} />
        <Stat value={`${stats.distance_km}km`} label="탐험 거리" color="#5EA9D8" />
        <Stat value={`${stats.new_species}종`} label="새 친구" color="#7FB86A" />
      </View>
    </View>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
});
