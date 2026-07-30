import { useEffect, useRef } from 'react';
import { Dimensions, Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PROFESSOR_SIZE = 168;

export type IntroProfessorPhase = 'hidden' | 'featured' | 'corner' | 'exit';

interface Props {
  phase: IntroProfessorPhase;
}

interface Layout {
  top: number;
  left: number;
  scale: number;
  opacity: number;
}

const LAYOUTS: Record<IntroProfessorPhase, Layout> = {
  hidden: { top: -PROFESSOR_SIZE - 40, left: SCREEN_WIDTH / 2 - PROFESSOR_SIZE / 2, scale: 0.6, opacity: 0 },
  featured: { top: SCREEN_HEIGHT * 0.13, left: SCREEN_WIDTH / 2 - PROFESSOR_SIZE / 2, scale: 1, opacity: 1 },
  corner: { top: SCREEN_HEIGHT * 0.07, left: 10, scale: 0.52, opacity: 1 },
  exit: { top: -PROFESSOR_SIZE - 60, left: SCREEN_WIDTH + 60, scale: 0.7, opacity: 0 },
};

/**
 * 인트로 컷씬 전용 박사 연출. 새 그림 없이 기존 dex-professor.png 한 장을
 * 화면 위치·크기·기울임(Reanimated)만으로 "날아와서 앉고, 안경을 고치고,
 * 다시 날아가는" 동작을 표현한다.
 */
export function IntroProfessor({ phase }: Props) {
  const top = useSharedValue(LAYOUTS.hidden.top);
  const left = useSharedValue(LAYOUTS.hidden.left);
  const scale = useSharedValue(LAYOUTS.hidden.scale);
  const opacity = useSharedValue(LAYOUTS.hidden.opacity);
  const rotate = useSharedValue(0);
  const bob = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const prevPhase = useRef<IntroProfessorPhase>('hidden');

  useEffect(() => {
    const target = LAYOUTS[phase];
    const enteringFeatured = phase === 'featured' && prevPhase.current !== 'featured';
    prevPhase.current = phase;

    top.value = withTiming(target.top, { duration: 900, easing: Easing.out(Easing.cubic) });
    left.value = withTiming(target.left, { duration: 900, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(target.scale, { duration: 900, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(target.opacity, { duration: phase === 'exit' ? 700 : 500 });

    if (enteringFeatured) {
      // 살짝 튕기며 안경을 고쳐 쓰는 듯한 흔들림 연출("귀엽게 안경을 고칩니다").
      rotate.value = withDelay(
        650,
        withSequence(
          withTiming(-7, { duration: 130 }),
          withTiming(6, { duration: 130 }),
          withTiming(-3, { duration: 110 }),
          withTiming(0, { duration: 140 })
        )
      );
      sparkle.value = withDelay(650, withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 500 })));
    }
  }, [phase, top, left, scale, opacity, rotate, sparkle]);

  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(-5, { duration: 1100 }), withTiming(5, { duration: 1100 })), -1, true);
  }, [bob]);

  const containerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: top.value,
    left: left.value,
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: bob.value }, { rotate: `${rotate.value}deg` }],
  }));
  const sparkleStyle = useAnimatedStyle(() => ({ opacity: sparkle.value }));

  return (
    <Animated.View style={containerStyle} pointerEvents="none">
      <Image
        source={require('../../../../assets/professor/dex-professor.png')}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel="안경을 쓰고 생태 도감을 든 부엉이 박사, 아울 박사"
      />
      <Animated.Text style={[styles.sparkle, sparkleStyle]}>✨</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  image: { width: PROFESSOR_SIZE, height: PROFESSOR_SIZE * (154 / 126) },
  sparkle: { position: 'absolute', top: 18, right: 6, fontSize: 22 },
});
