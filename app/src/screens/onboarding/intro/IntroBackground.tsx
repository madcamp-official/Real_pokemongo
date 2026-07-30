import { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { IntroSceneId } from './introScript';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  scene: IntroSceneId;
}

const DAY_SKY = ['#BFE6F7', '#E9F6E0'] as const;

/**
 * 인트로 컷씬 전용 숲·강·산 배경. 새 래스터 그림 없이 그라데이션 + SVG 도형 +
 * Reanimated 루프만으로 "살아 움직이는 숲"을 표현한다. 화면마다 다시 그리지 않도록
 * scene 전환에 필요한 애니메이션(줌아웃/줌인, 미스터리 톤 전환)만 반응한다.
 */
export function IntroBackground({ scene }: Props) {
  const isMystery = scene === 'mystery';
  const scale = useSharedValue(1.18);
  const hasZoomedOut = useRef(false);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (scene === 'world' && !hasZoomedOut.current) {
      hasZoomedOut.current = true;
      scale.value = withTiming(1, { duration: 7000, easing: Easing.out(Easing.cubic) });
    }
    if (scene === 'finale') {
      scale.value = withTiming(1.24, { duration: 6000, easing: Easing.inOut(Easing.cubic) });
    }
  }, [scene, scale]);

  useEffect(() => {
    overlayOpacity.value = withTiming(isMystery ? 1 : 0, { duration: 900 });
  }, [isMystery, overlayOpacity]);

  const sceneStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, sceneStyle]}>
        <LinearGradient colors={DAY_SKY} style={StyleSheet.absoluteFill} />
        <FarMountains />
        <River />
        <TreeLine />
        <Birds active={!isMystery} />
        <Particles mystery={isMystery} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.mysteryOverlay, overlayStyle]}
      />
    </View>
  );
}

function FarMountains() {
  return (
    <Svg
      style={styles.layer}
      width="100%"
      height="46%"
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMax slice"
    >
      <Path d="M0,160 L60,70 L130,120 L210,40 L300,110 L400,60 L400,160 Z" fill="#9FC7B8" opacity={0.9} />
      <Path d="M0,160 L90,105 L170,150 L260,95 L340,145 L400,110 L400,160 Z" fill="#7FAE93" opacity={0.95} />
    </Svg>
  );
}

function River() {
  return (
    <Svg
      style={styles.layer}
      width="100%"
      height="30%"
      viewBox="0 0 400 100"
      preserveAspectRatio="xMidYMax slice"
    >
      <Path
        d="M-20,40 C60,10 100,70 180,45 C260,20 300,80 420,35 L420,100 L-20,100 Z"
        fill="#BFE0EE"
      />
      <Path
        d="M-20,50 C60,25 100,78 180,55 C260,32 300,85 420,48"
        stroke="#E8F6FB"
        strokeWidth={3}
        fill="none"
        opacity={0.7}
      />
    </Svg>
  );
}

function TreeLine() {
  const trunks = [24, 74, 320, 368];
  return (
    <Svg style={styles.groundLayer} width="100%" height="22%" viewBox="0 0 400 90">
      <Path d="M0,90 L0,55 Q200,20 400,55 L400,90 Z" fill="#6FA35C" />
      {trunks.map((x, i) => (
        <Path key={x} d={`M${x},60 L${x},90`} stroke="#4E7A43" strokeWidth={6} opacity={0.5 + (i % 2) * 0.2} />
      ))}
    </Svg>
  );
}

function Birds({ active }: { active: boolean }) {
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: 600 });
  }, [active, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Bird startY={70} duration={9000} scale={1} />
      <Bird startY={110} duration={13000} scale={0.7} delay={2200} />
    </Animated.View>
  );
}

function Bird({
  startY,
  duration,
  scale,
  delay = 0,
}: {
  startY: number;
  duration: number;
  scale: number;
  delay?: number;
}) {
  const x = useSharedValue(-40);
  const bob = useSharedValue(0);
  useEffect(() => {
    x.value = withDelay(
      delay,
      withRepeat(withTiming(SCREEN_WIDTH + 40, { duration, easing: Easing.linear }), -1, false)
    );
    bob.value = withRepeat(withSequence(withTiming(-6, { duration: 420 }), withTiming(6, { duration: 420 })), -1, true);
  }, [x, bob, duration, delay]);
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    top: startY,
    transform: [{ translateX: x.value }, { translateY: bob.value }, { scale }],
  }));
  return (
    <Animated.View style={style}>
      <Svg width={40} height={16} viewBox="0 0 40 16">
        <Path
          d="M0,10 Q10,0 20,10 Q30,0 40,10"
          stroke="#3A4A3E"
          strokeWidth={2.4}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

const PARTICLE_SEEDS = [
  { x: 40, y: 200, delay: 0 },
  { x: 120, y: 320, delay: 400 },
  { x: 260, y: 180, delay: 800 },
  { x: 320, y: 380, delay: 200 },
  { x: 190, y: 460, delay: 650 },
];

function Particles({ mystery }: { mystery: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PARTICLE_SEEDS.map((p) => (
        <Particle key={`${p.x}-${p.y}`} {...p} mystery={mystery} />
      ))}
    </View>
  );
}

function Particle({
  x,
  y,
  delay,
  mystery,
}: {
  x: number;
  y: number;
  delay: number;
  mystery: boolean;
}) {
  const rise = useSharedValue(0);
  useEffect(() => {
    rise.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
  }, [rise, delay]);
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x,
    top: y - rise.value * 26,
    opacity: 0.35 + rise.value * 0.4,
    transform: [{ scale: 0.8 + rise.value * 0.5 }],
  }));
  return (
    <Animated.View style={style}>
      <Svg width={8} height={8}>
        <Circle cx={4} cy={4} r={4} fill={mystery ? '#BFD8E8' : '#F3E7A8'} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, bottom: '18%' },
  groundLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  mysteryOverlay: { backgroundColor: 'rgba(18, 26, 34, 0.55)' },
});
