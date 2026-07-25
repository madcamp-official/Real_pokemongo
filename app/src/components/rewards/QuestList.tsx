import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { Quest } from '@/types/api';

/**
 * 퀘스트 목록/진행률 (F10).
 * 힌트가 있으면 종 카드로 이동하는 칩을 함께 보여준다.
 */
interface Props {
  quests: Quest[];
  claimingId: string | null;
  onClaim: (questId: string) => void;
  onHintPress: (speciesId: string) => void;
}

export function QuestList({ quests, claimingId, onClaim, onHintPress }: Props) {
  if (quests.length === 0) {
    return <Text style={styles.empty}>지금은 진행 중인 퀘스트가 없어요.</Text>;
  }

  return (
    <View style={styles.container}>
      {quests.map((q) => {
        const ratio = q.target > 0 ? Math.min(q.progress / q.target, 1) : 0;
        const isClaiming = claimingId === q.quest_id;

        return (
          <View key={q.quest_id} style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{q.title}</Text>
              {q.status === 'claimed' && (
                <View style={styles.doneTag}>
                  <Text style={styles.doneTagText}>완료</Text>
                </View>
              )}
            </View>
            <Text style={styles.desc}>{q.description}</Text>

            {q.hint_species_id && (
              <Pressable
                style={styles.hintChip}
                onPress={() => onHintPress(q.hint_species_id as string)}
              >
                <Text style={styles.hintChipText}>💡 힌트 보기</Text>
              </Pressable>
            )}

            <View style={styles.progressRow}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {q.progress}/{q.target}
              </Text>
            </View>

            <View style={styles.footerRow}>
              <Text style={styles.reward}>보상 +{q.reward_xp} XP</Text>
              {q.status === 'completed' && (
                <Pressable
                  style={styles.claimBtn}
                  onPress={() => onClaim(q.quest_id)}
                  disabled={isClaiming}
                >
                  {isClaiming ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.claimBtnText}>보상 받기</Text>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  desc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  doneTag: { backgroundColor: colors.safeBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  doneTagText: { fontSize: 11, fontWeight: '700', color: colors.safeText },
  hintChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.funFactBg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hintChipText: { fontSize: 12, fontWeight: '700', color: colors.funFactAccent },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  progressText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reward: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  claimBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
  claimBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
});
