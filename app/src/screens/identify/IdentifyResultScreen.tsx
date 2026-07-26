import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { identifySighting, confirmIdentify } from '@/api/identify';
import { fetchDex } from '@/api/dex';
import { queryClient } from '@/api/queryClient';
import { useUploadQueue } from '@/store/uploadQueueStore';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'IdentifyResult'>;

const MAX_ATTEMPTS = 3;

/**
 * F4 동정 결과 화면.
 * 업로드 큐 항목(uploadId)이 sighting_id 를 받을 때까지 대기 → 동정 호출 →
 * 신뢰도에 따라 "새로운 친구 발견!" 연출 또는 "어떤 모습에 가까운가요?" 후보 선택.
 * 위험 생물이면 종 카드(안전 수칙 최상단)를 우선 노출한다.
 */
export default function IdentifyResultScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { uploadId } = route.params;

  const item = useUploadQueue((s) => s.items.find((i) => i.id === uploadId));
  const sightingId = item?.sightingId;
  const uploadFailed = item?.status === 'failed' && item.attempts >= MAX_ATTEMPTS;

  const identifyQuery = useQuery({
    queryKey: ['identify', sightingId],
    queryFn: () => identifySighting(sightingId as string),
    enabled: !!sightingId,
  });

  const dexQuery = useQuery({ queryKey: ['dex'], queryFn: fetchDex });
  const nameOf = useMemo(() => {
    const map = new Map((dexQuery.data ?? []).map((e) => [e.species_id, e.name]));
    return (id: string) => map.get(id) ?? '새로운 친구';
  }, [dexQuery.data]);

  const close = () => navigation.goBack();

  const confirmAndOpen = async (speciesId: string) => {
    if (sightingId) {
      try {
        await confirmIdentify(sightingId, speciesId);
      } catch {
        // 확정 실패해도 카드 열람은 진행 (재시도는 후속 과제)
      }
    }
    void queryClient.invalidateQueries({ queryKey: ['dex'] });
    // 관찰 확정으로 서버 XP/레벨/퀘스트 진행이 바뀌었을 수 있다(ObservationFlow.recordIdentification이
    // 내부적으로 RewardEngine.onObservation과 QuestEngine.applyObservation을 호출) — 보상함
    // 화면이 30초 staleTime이 지나기 전에도 최신 값을 받도록 무효화한다.
    void queryClient.invalidateQueries({ queryKey: ['xp-profile'] });
    void queryClient.invalidateQueries({ queryKey: ['quests', 'active'] });
    navigation.replace('SpeciesCard', { speciesId });
  };

  // ── 상태 렌더링 ────────────────────────────────────────────────
  let content: React.ReactNode;

  if (uploadFailed) {
    content = (
      <Status
        emoji="📡"
        title="사진을 올리지 못했어요"
        desc="네트워크를 확인하고 다시 시도해 주세요."
        actionLabel="닫기"
        onAction={close}
      />
    );
  } else if (!sightingId) {
    content = <Loading title="사진을 확인하고 있어요..." />;
  } else if (identifyQuery.isLoading) {
    content = <Loading title="어떤 친구인지 알아보는 중..." />;
  } else if (identifyQuery.isError || !identifyQuery.data) {
    content = (
      <Status
        emoji="🤔"
        title="잘 모르겠어요"
        desc="다시 찍어볼까요? 생물을 화면 가운데 담아주세요."
        actionLabel="다시 찍기"
        onAction={close}
      />
    );
  } else {
    const data = identifyQuery.data;
    const top = data.candidates[0];

    if (!top) {
      content = (
        <Status
          emoji="🔍"
          title="친구를 찾지 못했어요"
          desc="조금 더 가까이에서 다시 찍어볼까요?"
          actionLabel="다시 찍기"
          onAction={close}
        />
      );
    } else if (data.is_dangerous) {
      const visual = getSpeciesVisual(top.species_id);
      content = (
        <View style={styles.centerBox}>
          <View style={[styles.bigThumb, { backgroundColor: colors.dangerBg }]}>
            <Text style={styles.bigEmoji}>{visual.emoji}</Text>
          </View>
          <View style={styles.dangerTag}>
            <Text style={styles.dangerTagText}>⚠️ 조심해야 할 친구예요</Text>
          </View>
          <Text style={styles.resultName}>{nameOf(top.species_id)}일 수 있어요</Text>
          <Text style={styles.resultDesc}>안전 정보를 먼저 확인해요.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => void confirmAndOpen(top.species_id)}>
            <Text style={styles.primaryBtnText}>안전 정보 보기</Text>
          </Pressable>
        </View>
      );
    } else if (data.needs_user_confirmation) {
      content = (
        <View style={styles.centerBox}>
          <Text style={styles.resultName}>어떤 모습에 가까운가요?</Text>
          <Text style={styles.resultDesc}>가장 비슷한 친구를 골라주세요.</Text>
          <View style={styles.candidateList}>
            {data.candidates.map((c) => {
              const v = getSpeciesVisual(c.species_id);
              return (
                <Pressable
                  key={c.species_id}
                  style={styles.candidateRow}
                  onPress={() => void confirmAndOpen(c.species_id)}
                >
                  <View style={[styles.candidateThumb, { backgroundColor: getPastel(v.pastel) }]}>
                    <Text style={styles.candidateEmoji}>{v.emoji}</Text>
                  </View>
                  <Text style={styles.candidateName}>{nameOf(c.species_id)}</Text>
                  <Text style={styles.candidatePct}>{Math.round(c.confidence * 100)}%</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    } else {
      const visual = getSpeciesVisual(top.species_id);
      content = (
        <View style={styles.centerBox}>
          <Text style={styles.sparkle}>✨</Text>
          <Text style={styles.discoverTitle}>새로운 친구 발견!</Text>
          <View style={[styles.bigThumb, { backgroundColor: getPastel(visual.pastel) }]}>
            <Text style={styles.bigEmoji}>{visual.emoji}</Text>
          </View>
          <Text style={styles.resultName}>{nameOf(top.species_id)}</Text>
          <Text style={styles.resultDesc}>{Math.round(top.confidence * 100)}% 확신해요</Text>
          <Pressable style={styles.primaryBtn} onPress={() => void confirmAndOpen(top.species_id)}>
            <Text style={styles.primaryBtnText}>도감에 담기</Text>
          </Pressable>
        </View>
      );
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable style={styles.closeButton} onPress={close}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
      {content}
    </View>
  );
}

function Loading({ title }: { title: string }) {
  return (
    <View style={styles.centerBox}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{title}</Text>
    </View>
  );
}

function Status({
  emoji,
  title,
  desc,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  desc: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.centerBox}>
      <Text style={styles.bigEmoji}>{emoji}</Text>
      <Text style={styles.resultName}>{title}</Text>
      <Text style={styles.resultDesc}>{desc}</Text>
      <Pressable style={styles.primaryBtn} onPress={onAction}>
        <Text style={styles.primaryBtnText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
  closeButton: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 18, fontWeight: '700', color: colors.textSecondary },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 12 },

  sparkle: { fontSize: 32 },
  discoverTitle: { fontSize: 22, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  bigThumb: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  bigEmoji: { fontSize: 90 },
  resultName: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  resultDesc: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },

  dangerTag: {
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  dangerTagText: { color: colors.dangerText, fontSize: 14, fontWeight: '800' },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 24,
  },
  primaryBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800' },

  candidateList: { width: '100%', gap: 12, marginTop: 12 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
  },
  candidateThumb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  candidateEmoji: { fontSize: 26 },
  candidateName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  candidatePct: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
});
