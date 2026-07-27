import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';

interface Props {
  source: ImageSourcePropType;
  size: number;
}

/**
 * 날개가 있는 홈가든 곤충의 공통 날갯짓.
 *
 * 원본은 항상 완전한 형태로 남겨 몸과 날개가 분리되어 보이는 문제를 막는다.
 * 상단 날개 영역의 반투명 잔상만 짧은 주기로 압축·이동해 작은 스프라이트에서도
 * 날갯짓이 읽히도록 한다.
 */
export function WingedInsectFlutterArt({ source, size }: Props) {
  const wingBeat = useRef(new Animated.Value(0)).current;
  const maskLeft = size * 0.08;
  const maskTop = size * 0.02;
  const maskWidth = size * 0.84;
  const maskHeight = size * 0.68;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wingBeat, {
          toValue: 1,
          duration: 125,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(wingBeat, {
          toValue: 0,
          duration: 165,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [wingBeat]);

  const opacity = wingBeat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.12, 0.58, 0.18],
  });
  const scaleY = wingBeat.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.76],
  });
  const translateY = wingBeat.interpolate({
    inputRange: [0, 1],
    outputRange: [-0.8, 1.2],
  });

  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Image
        source={source}
        resizeMode="contain"
        style={{ width: size, height: size }}
        accessibilityIgnoresInvertColors
      />
      <View
        style={[
          styles.mask,
          {
            left: maskLeft,
            top: maskTop,
            width: maskWidth,
            height: maskHeight,
          },
        ]}
      >
        <Animated.View
          style={{
            width: size,
            height: size,
            marginLeft: -maskLeft,
            marginTop: -maskTop,
            opacity,
            transform: [{ translateY }, { scaleY }],
          }}
        >
          <Image
            source={source}
            resizeMode="contain"
            style={{ width: size, height: size }}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mask: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
