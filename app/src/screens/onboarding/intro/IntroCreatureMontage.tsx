import { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { getGardenCreatureImageSource } from '@/components/garden/GardenCreatureArt';

interface Props {
  speciesIds: readonly string[];
  /** 이 씬이 화면에 보이는 동안에만 스스로 다음 종으로 넘어간다. */
  active: boolean;
  /** ④ 문제 제기 씬 — 도감의 미수집 종 실루엣과 같은 표현(tintColor)을 재사용한다. */
  silhouette: boolean;
}

const CYCLE_MS = 650;

/**
 * ③ 생물 소개 몽타주. 이미 도감/홈가든에 있는 종 PNG를 빠르게 순서대로 팝인
 * 전환한다. 새 그림을 그리지 않고 기존 GardenCreatureArt 레지스트리의 원본을 그대로
 * 쓰고, 대사 진행과 별개로 씬이 켜져 있는 동안 스스로 순환한다.
 */
export function IntroCreatureMontage({ speciesIds, active, silhouette }: Props) {
  const [displayIndex, setDisplayIndex] = useState(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: 400 });
    if (!active) return;
    setDisplayIndex(0);
    scale.value = 0.85;
    scale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.5)) });

    const interval = setInterval(() => {
      opacity.value = withTiming(0, { duration: 140 });
      setTimeout(() => {
        setDisplayIndex((i) => (i + 1) % speciesIds.length);
        scale.value = 0.85;
        scale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.5)) });
        opacity.value = withTiming(1, { duration: 220 });
      }, 140);
    }, CYCLE_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const source = getGardenCreatureImageSource(speciesIds[displayIndex]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!source) return null;

  return (
    <Animated.View style={[styles.wrap, animatedStyle]} pointerEvents="none">
      <Image
        source={source}
        resizeMode="contain"
        style={[
          styles.image,
          silhouette && { tintColor: '#AAA8AA' },
          silhouette && styles.silhouetteOpacity,
        ]}
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  image: { width: 172, height: 172 },
  silhouetteOpacity: { opacity: 0.86 },
});
