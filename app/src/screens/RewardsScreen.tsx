import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { fetchXpProfile, fetchBadges, claimBadge } from '@/api/rewards';
import { fetchActiveQuests, claimQuest } from '@/api/quests';
import { queryClient } from '@/api/queryClient';
import { useRewardsStore } from '@/store/rewardsStore';
import { XPBar } from '@/components/rewards/XPBar';
import { BadgeGrid } from '@/components/rewards/BadgeGrid';
import { QuestList } from '@/components/rewards/QuestList';
import { LevelUpCelebration } from '@/components/rewards/LevelUpCelebration';
import { colors } from '@/theme/colors';
import type { RootStackParamList } from '@/navigation/types';
import type { XPProfile } from '@/types/api';

/**
 * F8/F10 보상함 화면. 레벨/XP, 배지 목록(테마별), 진행 중인 퀘스트를 한 화면에서 관리.
 */
export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const setLevel = useRewardsStore((s) => s.setLevel);

  const [claimingBadgeId, setClaimingBadgeId] = useState<string | null>(null);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ visible: boolean; level: number }>({
    visible: false,
    level: 1,
  });

  const xpQuery = useQuery({ queryKey: ['xp-profile'], queryFn: fetchXpProfile });
  const badgesQuery = useQuery({ queryKey: ['badges'], queryFn: fetchBadges });
  const questsQuery = useQuery({ queryKey: ['quests', 'active'], queryFn: fetchActiveQuests });

  useEffect(() => {
    if (xpQuery.data) setLevel(xpQuery.data.level);
  }, [xpQuery.data, setLevel]);

  const applyXpResult = (before: number | undefined, res: XPProfile) => {
    setLevel(res.level);
    if (res.leveled_up && before != null && res.level > before) {
      setCelebration({ visible: true, level: res.level });
    }
    queryClient.setQueryData(['xp-profile'], res);
  };

  const onClaimBadge = async (badgeId: string) => {
    if (claimingBadgeId) return;
    setClaimingBadgeId(badgeId);
    const beforeLevel = xpQuery.data?.level;
    try {
      const res = await claimBadge(badgeId);
      applyXpResult(beforeLevel, res);
      void queryClient.invalidateQueries({ queryKey: ['badges'] });
    } finally {
      setClaimingBadgeId(null);
    }
  };

  const onClaimQuest = async (questId: string) => {
    if (claimingQuestId) return;
    setClaimingQuestId(questId);
    const beforeLevel = xpQuery.data?.level;
    try {
      const res = await claimQuest(questId);
      applyXpResult(beforeLevel, res);
      void queryClient.invalidateQueries({ queryKey: ['quests', 'active'] });
      void queryClient.invalidateQueries({ queryKey: ['badges'] });
    } finally {
      setClaimingQuestId(null);
    }
  };

  const onHintPress = (speciesId: string) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('SpeciesCard', { speciesId });
  };

  const isLoading = xpQuery.isLoading || badgesQuery.isLoading || questsQuery.isLoading;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>보상함</Text>
      </View>

      {isLoading || !xpQuery.data ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.xpCard}>
            <XPBar profile={xpQuery.data} />
          </View>

          <Text style={styles.sectionHeading}>오늘의 퀘스트</Text>
          <QuestList
            quests={questsQuery.data ?? []}
            claimingId={claimingQuestId}
            onClaim={(id) => void onClaimQuest(id)}
            onHintPress={onHintPress}
          />

          <Text style={styles.sectionHeading}>배지</Text>
          <BadgeGrid
            badges={badgesQuery.data ?? []}
            claimingId={claimingBadgeId}
            onClaim={(id) => void onClaimBadge(id)}
          />
        </ScrollView>
      )}

      <LevelUpCelebration
        visible={celebration.visible}
        level={celebration.level}
        onDone={() => setCelebration((c) => ({ ...c, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  xpCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  sectionHeading: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginTop: 6 },
});
