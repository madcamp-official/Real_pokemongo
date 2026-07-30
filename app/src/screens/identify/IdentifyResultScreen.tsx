import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { identifySighting, confirmIdentify } from '@/api/identify';
import { fetchDex } from '@/api/dex';
import { queryClient } from '@/api/queryClient';
import { useUploadQueue } from '@/store/uploadQueueStore';
import { colors, discoveryGradient, alertGradient } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import { GardenCreatureArt } from '@/components/garden/GardenCreatureArt';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'IdentifyResult'>;

const MAX_ATTEMPTS = 3;

/** 배경 톤 — 발견 축하는 크림→핑크, 위험 경고는 크림→레드. */
type Tone = 'discovery' | 'alert';

/**
 * F4 동정 결과 화면.
 * 업로드 큐 항목(uploadId)이 sighting_id 를 받을 때까지 대기 → 동정 호출 →
 * 신뢰도에 따라 "새로운 친구를 발견했어요!" 축하 연출 또는 "어떤 모습에 가까운가요?"
 * 후보 선택. 위험 생물이면 종 카드(안전 수칙 최상단)를 우선 노출한다.
 *
 * 작명은 이 화면에서 하지 않는다 — 홈 가든(F16)의 개체 상태 시트가 담당한다.
 */
export default function IdentifyResultScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { uploadId } = route.params;

  const item = useUploadQueue((s) => s.items.find((i) => i.id === uploadId));
  const retryItem = useUploadQueue((s) => s.retryItem);
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
  let tone: Tone = 'discovery';
  /** 축하 연출(장식 점)은 실제 "발견" 순간에만 — 로딩/실패 화면은 담백하게 둔다. */
  let celebratory = false;

  if (uploadFailed) {
    content = (
      <Status
        emoji="📡"
        title="사진을 올리지 못했어요"
        desc="네트워크를 확인하고 다시 시도해 주세요."
        actionLabel="다시 시도"
        onAction={() => retryItem(uploadId)}
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
      tone = 'alert';
      content = (
        <View style={styles.centerBox}>
          <Text style={styles.eyebrowDanger}>⚠️ CAREFUL ⚠️</Text>
          <Text style={styles.title}>조심해야 할{'\n'}친구예요</Text>
          <Halo tint={colors.dangerBg}>
            <GardenCreatureArt speciesId={top.species_id} size={124} />
          </Halo>
          <Text style={styles.speciesName}>{nameOf(top.species_id)}일 수 있어요</Text>
          <Text style={styles.subText}>가까이 가기 전에 안전 정보를 먼저 확인해요.</Text>
          <View style={styles.actions}>
            <PrimaryButton label="안전 정보 보기" onPress={() => void confirmAndOpen(top.species_id)} />
            <SecondaryButton label="다시 찍기" onPress={close} />
          </View>
        </View>
      );
    } else if (data.needs_user_confirmation) {
      content = (
        <View style={styles.centerBox}>
          <Text style={styles.eyebrow}>✦ WHO IS THIS ✦</Text>
          <Text style={styles.title}>어떤 모습에{'\n'}가까운가요?</Text>
          <Text style={styles.subText}>가장 비슷한 친구를 골라주세요.</Text>
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
                    <GardenCreatureArt speciesId={c.species_id} size={38} />
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
      celebratory = true;
      content = (
        <View style={styles.centerBox}>
          <Text style={styles.eyebrow}>✦ NEW FRIEND ✦</Text>
          <Text style={styles.title}>새로운 친구를{'\n'}발견했어요!</Text>
          <Halo tint={getPastel(visual.pastel)}>
            <GardenCreatureArt speciesId={top.species_id} size={124} />
          </Halo>
          <Text style={styles.speciesName}>{nameOf(top.species_id)}</Text>
          <View style={styles.confidenceChip}>
            <Text style={styles.confidenceText}>🎯 {Math.round(top.confidence * 100)}% 확신해요</Text>
          </View>
          <View style={styles.actions}>
            <PrimaryButton label="도감에 추가하기" onPress={() => void confirmAndOpen(top.species_id)} />
            <SecondaryButton label="다시 찍기" onPress={close} />
          </View>
        </View>
      );
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={tone === 'alert' ? alertGradient : discoveryGradient}
        style={StyleSheet.absoluteFill}
      />
      {celebratory && <Confetti />}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Pressable style={styles.closeButton} onPress={close} accessibilityLabel="닫기">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        {content}
      </ScrollView>
    </View>
  );
}

/** 시안의 "빛나는 원형 썸네일" — 흰 원 + 종 파스텔 톤의 옅은 후광. */
function Halo({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <View style={styles.haloWrap}>
      <View style={[styles.haloGlow, { backgroundColor: tint }]} />
      <View style={styles.haloCircle}>{children}</View>
    </View>
  );
}

/** 축하 화면 배경의 색점 장식. 정적 배치라 위치는 상수로 고정한다. */
function Confetti() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {DOTS.map((d, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { left: d.left, top: d.top, width: d.size, height: d.size, borderRadius: d.size / 2, backgroundColor: d.color },
          ]}
        />
      ))}
    </View>
  );
}

const DOTS = [
  { left: '12%', top: '18%', size: 14, color: '#F6C453' },
  { left: '84%', top: '24%', size: 10, color: '#7FC98A' },
  { left: '18%', top: '31%', size: 9, color: '#F08A6E' },
  { left: '88%', top: '38%', size: 13, color: '#B79BE8' },
  { left: '8%', top: '62%', size: 10, color: '#F08A6E' },
  { left: '90%', top: '68%', size: 9, color: '#F6C453' },
] as const;

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function Loading({ title }: { title: string }) {
  return (
    <View style={styles.centerBox}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.subText}>{title}</Text>
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
      <Halo tint={colors.surfaceMuted}>
        <Text style={styles.bigEmoji}>{emoji}</Text>
      </Halo>
      <Text style={styles.speciesName}>{title}</Text>
      <Text style={styles.subText}>{desc}</Text>
      <View style={styles.actions}>
        <PrimaryButton label={actionLabel} onPress={onAction} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },

  closeButton: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 18, fontWeight: '700', color: colors.textSecondary },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12 },

  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 2.5,
  },
  eyebrowDanger: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.dangerText,
    letterSpacing: 2.5,
  },
  title: {
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  haloWrap: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  haloGlow: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    opacity: 0.45,
  },
  haloCircle: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B98B7A',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bigEmoji: { fontSize: 88 },

  speciesName: { fontSize: 26, fontWeight: '900', color: colors.textPrimary, textAlign: 'center' },
  subText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },

  confidenceChip: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  confidenceText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  actions: { width: '100%', gap: 12, marginTop: 14 },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 17,
    borderRadius: 26,
    alignItems: 'center',
    shadowColor: colors.accentDark,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 17, fontWeight: '800' },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: 26,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  secondaryBtnText: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  dot: { position: 'absolute' },

  candidateList: { width: '100%', gap: 12, marginTop: 12 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20,
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
