import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { XPProfile } from '@/types/api';

/**
 * 경험치 바 · 레벨 표시 (F8).
 */
interface Props {
  profile: XPProfile;
}

export function XPBar({ profile }: Props) {
  const ratio = profile.xp_to_next > 0 ? Math.min(profile.xp / profile.xp_to_next, 1) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.levelBadge}>
        <Text style={styles.levelText}>Lv.{profile.level}</Text>
      </View>
      <View style={styles.barArea}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        </View>
        <Text style={styles.xpText}>
          {profile.xp} / {profile.xp_to_next} XP
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  levelBadge: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  levelText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800' },
  barArea: { flex: 1, gap: 6 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  xpText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
});
