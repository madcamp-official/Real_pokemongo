import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

/**
 * 종 카드 정보 타일 (F6). 2×2 그리드로 서식지/크기/활동시간/희귀도를 표시.
 */
interface Props {
  label: string;
  value: string;
}

export function InfoTile({ label, value }: Props) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  value: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
});
