import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/colors';
import { IntroBackground } from './IntroBackground';
import { IntroProfessor, type IntroProfessorPhase } from './IntroProfessor';
import { IntroCreatureMontage } from './IntroCreatureMontage';
import { IntroDialogueBox } from './IntroDialogueBox';
import { IntroNameCard } from './IntroNameCard';
import { IntroMissionSteps } from './IntroMissionSteps';
import { INTRO_MONTAGE_SPECIES, INTRO_SCRIPT, fillNickname } from './introScript';

type Props = NativeStackScreenProps<RootStackParamList, 'Intro'>;

const START_BUTTON_DELAY_MS = 1400;

/**
 * 회원가입 직후 재생되는 "아울 박사" 인트로 컷씬(F1).
 * 새 그림 없이 기존 박사/생물 PNG와 코드 애니메이션만으로 포켓몬 인트로풍
 * 연출을 구성한다 — 세계 소개 → 박사 등장 → 생물 소개 → 문제 제기 →
 * 플레이어 소개 → 임무 부여 → 첫 탐험 시작 순으로 진행된다.
 */
export default function IntroCutsceneScreen({ navigation }: Props) {
  const nickname = useAuthStore((s) => s.user?.nickname)?.trim() || '탐험가';
  const [beatIndex, setBeatIndex] = useState(0);
  const [showStartButton, setShowStartButton] = useState(false);

  const beat = INTRO_SCRIPT[beatIndex];
  const isLastBeat = beatIndex === INTRO_SCRIPT.length - 1;

  const finish = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }, [navigation]);

  const advance = useCallback(() => {
    setBeatIndex((i) => Math.min(i + 1, INTRO_SCRIPT.length - 1));
  }, []);

  useEffect(() => {
    if (!isLastBeat) {
      setShowStartButton(false);
      return;
    }
    const t = setTimeout(() => setShowStartButton(true), START_BUTTON_DELAY_MS);
    return () => clearTimeout(t);
  }, [isLastBeat]);

  const professorPhase: IntroProfessorPhase =
    beat.scene === 'world'
      ? 'hidden'
      : beat.scene === 'enter' || beat.scene === 'greeting'
        ? 'featured'
        : beat.scene === 'finale'
          ? showStartButton
            ? 'exit'
            : 'featured'
          : 'corner'; // montage / mystery / mission

  const text = fillNickname(beat.text, nickname);
  const nameCardTitle = beat.nameCard ? fillNickname(beat.nameCard.title, nickname) : '';
  const nameCardSubtitle = beat.nameCard ? fillNickname(beat.nameCard.subtitle, nickname) : '';

  return (
    <View style={styles.root}>
      <IntroBackground scene={beat.scene} />

      <IntroCreatureMontage
        speciesIds={INTRO_MONTAGE_SPECIES}
        active={beat.scene === 'montage'}
        silhouette={false}
      />
      <IntroCreatureMontage
        speciesIds={INTRO_MONTAGE_SPECIES}
        active={beat.scene === 'mystery'}
        silhouette
      />

      <IntroProfessor phase={professorPhase} />

      {beat.scene === 'mission' && <IntroMissionSteps revealedCount={beat.missionStepsRevealed ?? 0} />}

      <IntroNameCard title={nameCardTitle} subtitle={nameCardSubtitle} visible={!!beat.nameCard} />

      {!showStartButton ? (
        <IntroDialogueBox
          key={beatIndex}
          text={text}
          speakerLabel={beat.speaker === 'professor' ? '아울 박사' : undefined}
          onAdvance={advance}
          onSkip={finish}
          showSkip
        />
      ) : (
        <View style={styles.ctaWrap}>
          <Pressable style={styles.ctaButton} onPress={finish}>
            <Text style={styles.ctaText}>첫 탐험 시작!</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#BFE6F7' },
  ctaWrap: { position: 'absolute', left: 0, right: 0, bottom: 48, alignItems: 'center' },
  ctaButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 28,
    shadowColor: '#1B2A22',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  ctaText: { color: colors.onPrimary, fontSize: 18, fontWeight: '900' },
});
