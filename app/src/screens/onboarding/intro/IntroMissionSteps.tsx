import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors } from '@/theme/colors';
import { INTRO_MISSION_STEPS } from './introScript';

interface Props {
  revealedCount: number;
}

/** ⑥ 임무 부여 — 촬영→동정→학습→도감 스텝을 대사에 맞춰 하나씩 공개한다. */
export function IntroMissionSteps({ revealedCount }: Props) {
  return (
    <View style={styles.row} pointerEvents="none">
      {INTRO_MISSION_STEPS.map((step, i) => (
        <View key={step.label} style={styles.stepWithArrow}>
          {i > 0 && <Text style={styles.arrow}>→</Text>}
          <StepChip emoji={step.emoji} label={step.label} revealed={i < revealedCount} />
        </View>
      ))}
    </View>
  );
}

function StepChip({ emoji, label, revealed }: { emoji: string; label: string; revealed: boolean }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.7);

  useEffect(() => {
    opacity.value = withTiming(revealed ? 1 : 0, { duration: 260 });
    scale.value = withTiming(revealed ? 1 : 0.7, { duration: 300, easing: Easing.out(Easing.back(1.6)) });
  }, [revealed, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.chip, style]}>
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    alignSelf: 'center',
    top: '44%',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  stepWithArrow: { flexDirection: 'row', alignItems: 'center' },
  arrow: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginHorizontal: 4 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 62,
  },
  chipEmoji: { fontSize: 20 },
  chipLabel: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.textPrimary },
});
