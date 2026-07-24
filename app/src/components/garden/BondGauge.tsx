import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

/**
 * 친밀도(Bond) 게이지 (F9/F16 공용).
 * Phase 5에서는 표시 전용. 상호작용 증가 로직은 Phase 8(F9)에서 연결.
 */
interface Props {
  value: number;
  max: number;
}

export function BondGauge({ value, max }: Props) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>친밀도</Text>
        <Text style={styles.hearts}>
          {'❤️'.repeat(value)}
          {'🤍'.repeat(Math.max(max - value, 0))}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  hearts: { fontSize: 13 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
});
