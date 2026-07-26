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
  // profile.xp(누적 총량)와 profile.xp_to_next(다음 레벨까지 남은 양)는 서로 기준이 달라
  // 그대로 나누면 안 된다(예: xp=49, xp_to_next=1일 때 49/1 같은 무의미한 값이 나옴).
  // xp_level_start(현재 레벨 시작 문턱값)를 빼서 "이번 레벨 안에서의 진행량"으로 정규화한다.
  const xpIntoLevel = Math.max(0, profile.xp - profile.xp_level_start);
  const xpForLevel = xpIntoLevel + profile.xp_to_next; // 이번 레벨의 총 폭(최고 레벨이면 xp_to_next=0)
  const ratio = xpForLevel > 0 ? Math.min(xpIntoLevel / xpForLevel, 1) : 1;

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
          {xpIntoLevel} / {xpForLevel} XP
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
