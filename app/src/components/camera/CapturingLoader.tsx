import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

/**
 * 촬영 직후 로딩 연출 (F2).
 * 촬영본 저장·업로드 준비 동안 표시. 회전 링 + 안내 문구.
 */
interface Props {
  visible: boolean;
  label?: string;
}

export function CapturingLoader({ visible, label = '담는 중...' }: Props) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [visible, spin]);

  if (!visible) return null;

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.backdrop}>
      <View style={styles.ringWrap}>
        <View style={styles.ringTrack} />
        <Animated.View style={[styles.ringSpinner, { transform: [{ rotate }] }]} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: {
    width: 56,
    height: 56,
    marginBottom: 16,
  },
  ringTrack: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 28,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  ringSpinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 28,
    borderWidth: 5,
    borderColor: 'transparent',
    borderTopColor: '#fff',
    borderRightColor: 'rgba(255,255,255,0.82)',
  },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
