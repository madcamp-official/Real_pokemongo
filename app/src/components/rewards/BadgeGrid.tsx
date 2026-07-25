import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, pastels } from '@/theme/colors';
import type { Badge, BadgeTheme } from '@/types/api';

const THEME_ORDER: BadgeTheme[] = ['수집', '탐험', '우정', '연속출석'];
const THEME_COLOR: Record<BadgeTheme, string> = {
  수집: pastels.cream,
  탐험: pastels.blue,
  우정: pastels.pink,
  연속출석: pastels.tan,
};

/**
 * 배지 목록 UI, 테마별 그룹핑 (F8).
 */
interface Props {
  badges: Badge[];
  claimingId: string | null;
  onClaim: (badgeId: string) => void;
}

export function BadgeGrid({ badges, claimingId, onClaim }: Props) {
  const groups = THEME_ORDER.map((theme) => ({
    theme,
    items: badges.filter((b) => b.theme === theme),
  })).filter((g) => g.items.length > 0);

  return (
    <View style={styles.container}>
      {groups.map((group) => (
        <View key={group.theme} style={styles.section}>
          <Text style={styles.sectionTitle}>{group.theme}</Text>
          <View style={styles.grid}>
            {group.items.map((badge) => {
              const claimable = badge.unlocked && !badge.claimed;
              const isClaiming = claimingId === badge.badge_id;
              return (
                <View
                  key={badge.badge_id}
                  style={[
                    styles.card,
                    { backgroundColor: badge.unlocked ? THEME_COLOR[group.theme] : colors.lockedCard },
                  ]}
                >
                  <Text style={[styles.icon, !badge.unlocked && styles.iconLocked]}>
                    {badge.unlocked ? badge.icon : '🔒'}
                  </Text>
                  <Text style={[styles.title, !badge.unlocked && styles.titleLocked]} numberOfLines={1}>
                    {badge.title}
                  </Text>
                  <Text style={styles.desc} numberOfLines={2}>
                    {badge.description}
                  </Text>

                  {claimable && (
                    <Pressable
                      style={styles.claimBtn}
                      onPress={() => onClaim(badge.badge_id)}
                      disabled={isClaiming}
                    >
                      {isClaiming ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <Text style={styles.claimBtnText}>받기</Text>
                      )}
                    </Pressable>
                  )}
                  {badge.claimed && (
                    <View style={styles.claimedTag}>
                      <Text style={styles.claimedText}>✓ 수령완료</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%',
    borderRadius: 18,
    padding: 14,
    gap: 4,
    minHeight: 128,
  },
  icon: { fontSize: 30 },
  iconLocked: { opacity: 0.5 },
  title: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  titleLocked: { color: colors.lockedText },
  desc: { fontSize: 11, color: colors.textSecondary, lineHeight: 15, flex: 1 },
  claimBtn: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  claimBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  claimedTag: { marginTop: 6 },
  claimedText: { fontSize: 11, fontWeight: '700', color: colors.safeText },
});
