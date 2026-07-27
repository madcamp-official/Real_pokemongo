import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { fetchSpeciesCard } from '@/api/species';
import { InfoTile } from '@/components/species/InfoTile';
import { QuizQuestion } from '@/components/species/QuizQuestion';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import { CreatureArt } from '@/components/species/CreatureArt';
import { PhotoGalleryBlock } from '@/components/species/PhotoGalleryBlock';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SpeciesCard'>;

const ACTIVE_TIME_ICON: Record<string, string> = { 낮: '☀️', 밤: '🌙', '낮·밤': '🌗' };

/**
 * F6 종 카드 상세.
 * 위험 생물이면 안전 수칙을 최상단에 고정 노출한다.
 */
export default function SpeciesCardScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { speciesId } = route.params;

  const { data: card, isLoading } = useQuery({
    queryKey: ['species', speciesId],
    queryFn: () => fetchSpeciesCard(speciesId),
  });

  if (isLoading || !card) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const visual = getSpeciesVisual(card.species_id);
  const heroBg = card.is_dangerous ? colors.dangerBg : getPastel(visual.pastel);
  const timeIcon = ACTIVE_TIME_ICON[card.active_time] ?? '🕒';
  // 앱이 새 버전이어도 이전 서버 응답·캐시에는 후속 콘텐츠 필드가 없을 수 있다.
  // 도감 기본 정보는 계속 보여 주고, 선택 콘텐츠만 빈 상태로 처리한다.
  const observePoints = card.observe_points ?? [];
  const quiz = card.quiz ?? [];
  const similarSpecies = card.similar_species ?? [];

  const inviteToGarden = () => {
    navigation.navigate('Main');
    // Phase 5(홈 가든)에서 특정 개체를 배치하는 실제 초대 플로우로 확장.
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* 히어로 */}
        <View style={[styles.hero, { backgroundColor: heroBg, paddingTop: insets.top + 8 }]}>
          <View style={styles.heroTopRow}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <View style={[styles.safetyPill, card.is_dangerous ? styles.dangerPill : styles.safePill]}>
              <Text style={[styles.safetyText, card.is_dangerous ? styles.dangerText : styles.safeText]}>
                {card.is_dangerous ? '⚠️ 조심해요' : '✓ 안전한 친구예요'}
              </Text>
            </View>
          </View>

          <View style={styles.heroImageWrap}>
            <CreatureArt speciesId={card.species_id} size={132} />
          </View>
        </View>

        <View style={styles.body}>
          {/* 위험 생물: 안전 수칙 최상단 고정 (F6) */}
          {card.is_dangerous && card.safety_notes && (
            <View style={styles.safetyBanner}>
              <Text style={styles.safetyBannerTitle}>⚠️ 안전 수칙</Text>
              <Text style={styles.safetyBannerText}>{card.safety_notes}</Text>
            </View>
          )}

          <Text style={styles.name}>{card.name}</Text>
          <Text style={styles.scientific}>{card.scientific_name}</Text>

          <View style={styles.tileGrid}>
            <View style={styles.tileRow}>
              <InfoTile label="서식지" value={card.habitat} />
              <InfoTile label="크기" value={card.size} />
            </View>
            <View style={styles.tileRow}>
              <InfoTile label="활동 시간" value={`${timeIcon} ${card.active_time}`} />
              <InfoTile label="희귀도" value={card.rarity} />
            </View>
          </View>

          <View style={styles.funFact}>
            <Text style={styles.funFactTitle}>💡 재미있는 사실</Text>
            <Text style={styles.funFactText}>{card.fun_fact}</Text>
          </View>

          {observePoints.length > 0 && (
            <View style={styles.observeSection}>
              <Text style={styles.sectionTitle}>🔍 관찰 포인트</Text>
              {observePoints.map((point) => (
                <View key={point} style={styles.observeRow}>
                  <Text style={styles.observeBullet}>•</Text>
                  <Text style={styles.observeText}>{point}</Text>
                </View>
              ))}
            </View>
          )}

          {quiz.length > 0 && (
            <View style={styles.quizSection}>
              <Text style={styles.sectionTitle}>🧠 퀴즈에 도전해봐요</Text>
              {quiz.map((q) => (
                <QuizQuestion key={q.q} question={q} />
              ))}
            </View>
          )}

          <Pressable style={styles.cta} onPress={inviteToGarden}>
            <Text style={styles.ctaText}>우리집 정원에 초대하기</Text>
          </Pressable>

          {similarSpecies.length > 0 && (
            <View style={styles.similarSection}>
              <Text style={styles.sectionTitle}>👀 헷갈리기 쉬운 친구들</Text>
              <View style={styles.similarRow}>
                {similarSpecies.map((s) => (
                  <Pressable
                    key={s.species_id}
                    style={styles.similarChip}
                    onPress={() => navigation.push('SpeciesCard', { speciesId: s.species_id })}
                  >
                    <Text style={styles.similarText}>{s.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.gallerySpacer} />
        <PhotoGalleryBlock speciesId={card.species_id} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },

  hero: { paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: -4 },
  safetyPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  safePill: { backgroundColor: colors.safeBg },
  dangerPill: { backgroundColor: colors.surface },
  safetyText: { fontSize: 13, fontWeight: '700' },
  safeText: { color: colors.safeText },
  dangerText: { color: colors.dangerText },
  heroImageWrap: {
    alignSelf: 'center',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  heroEmoji: { fontSize: 84 },

  body: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  gallerySpacer: { height: 20 },
  safetyBanner: {
    backgroundColor: colors.dangerBg,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  safetyBannerTitle: { fontSize: 14, fontWeight: '800', color: colors.dangerText },
  safetyBannerText: { fontSize: 14, color: colors.dangerText, lineHeight: 20 },

  name: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: -8 },

  tileGrid: { gap: 12 },
  tileRow: { flexDirection: 'row', gap: 12 },

  funFact: { backgroundColor: colors.funFactBg, borderRadius: 16, padding: 18, gap: 8 },
  funFactTitle: { fontSize: 14, fontWeight: '800', color: colors.funFactAccent },
  funFactText: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },

  observeSection: { gap: 10 },
  observeRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  observeBullet: { fontSize: 15, color: colors.primary, fontWeight: '800' },
  observeText: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  quizSection: { gap: 10 },

  cta: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaText: { color: colors.onPrimary, fontSize: 17, fontWeight: '800' },

  similarSection: { gap: 10 },
  similarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  similarChip: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  similarText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
});
