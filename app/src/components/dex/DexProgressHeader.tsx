import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { DexCompletion } from '@/types/api';

/**
 * 도감 상단 헤더 (F5).
 * "나의 도감" 타이틀 + 완성도(%) 배지 + 진행 바 + 발견/잔여 종수 안내.
 */
interface Props {
  completion?: DexCompletion;
}

export function DexProgressHeader({ completion }: Props) {
  const pct = completion?.percentage ?? 0;
  const discovered = completion?.discovered ?? 0;
  const remaining = completion ? Math.max(completion.total - completion.discovered, 0) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>나의 도감</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{Math.round(pct)}%</Text>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(pct, 100)}%` }]} />
      </View>

      <Text style={styles.subtitle}>
        {discovered}종 발견 · {remaining}종 남았어요
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  badge: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  badgeText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  subtitle: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
});
