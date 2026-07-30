import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

interface Props {
  title: string;
  feature: string;
  description: string;
}

/**
 * Phase 0 임시 화면.
 * 각 Phase에서 실제 화면 컴포넌트로 교체된다.
 */
export function ScreenPlaceholder({ title, feature, description }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.badge}>{feature}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.desc}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  desc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
