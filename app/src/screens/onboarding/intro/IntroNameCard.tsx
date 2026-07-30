import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface Props {
  title: string;
  subtitle: string;
  visible: boolean;
}

/**
 * "아울 박사 / 생태 연구소", "{닉네임} 탐험가님" 처럼 이름이 화면 중앙에
 * 크게 떴다가 사라지는 연출. 대사창과 별개로 잠깐 겹쳐 보여주는 타이틀 카드다.
 */
export function IntroNameCard({ title, subtitle, visible }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 260 });
      scale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.4)) });
    } else {
      opacity.value = withTiming(0, { duration: 220 });
      scale.value = withTiming(0.9, { duration: 220 });
    }
  }, [visible, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, style]} pointerEvents="none">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    top: '46%',
    alignItems: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(27, 42, 34, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#EAF6E1',
    letterSpacing: 1,
  },
});
