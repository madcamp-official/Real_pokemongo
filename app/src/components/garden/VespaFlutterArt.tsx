import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, Path } from 'react-native-svg';

interface Props {
  size: number;
}

const VESPA_SOURCE = require('../../../assets/species/garden-v4/game/vespa-mandarinia.png');

/**
 * Android에서도 레이어가 이탈하지 않는 장수말벌 날갯짓 표현.
 *
 * 원본 전체 이미지를 항상 몸통 레이어에 남겨 실루엣을 보존하고, 같은 이미지에서
 * 잘라낸 날개만 1~2px 범위로 압축·이동하며 빠른 잔상을 만든다.
 */
export function VespaFlutterArt({ size }: Props) {
  const wingBeat = useRef(new Animated.Value(0)).current;
  const id = useId().replace(/:/g, '');
  const wingClipId = `${id}-wings`;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wingBeat, {
          toValue: 1,
          duration: 115,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(wingBeat, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [wingBeat]);

  const nearOpacity = wingBeat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.18, 0.82, 0.28],
  });
  const farOpacity = wingBeat.interpolate({
    inputRange: [0, 1],
    outputRange: [0.42, 0.12],
  });
  const nearScaleY = wingBeat.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.72],
  });
  const farScaleY = wingBeat.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1.02],
  });
  const nearY = wingBeat.interpolate({
    inputRange: [0, 1],
    outputRange: [-1, 1.4],
  });
  const farY = wingBeat.interpolate({
    inputRange: [0, 1],
    outputRange: [1.2, -1],
  });

  const WingLayer = () => (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <ClipPath id={wingClipId}>
          <Path d="M207 235 C235 157 335 65 464 67 C489 68 487 96 467 119 C443 145 411 164 382 177 C425 157 469 149 493 157 C511 163 504 181 484 193 C420 235 304 251 207 235 Z" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${wingClipId})`}>
        <SvgImage href={VESPA_SOURCE} width={512} height={512} />
      </G>
    </Svg>
  );

  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Image
        source={VESPA_SOURCE}
        resizeMode="contain"
        style={{ width: size, height: size }}
        accessibilityIgnoresInvertColors
      />

      <Animated.View
        style={[
          styles.layer,
          {
            width: size,
            height: size,
            opacity: farOpacity,
            transform: [{ translateY: farY }, { scaleY: farScaleY }],
          },
        ]}
      >
        <WingLayer />
      </Animated.View>

      <Animated.View
        style={[
          styles.layer,
          {
            width: size,
            height: size,
            opacity: nearOpacity,
            transform: [{ translateY: nearY }, { scaleY: nearScaleY }],
          },
        ]}
      >
        <WingLayer />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
