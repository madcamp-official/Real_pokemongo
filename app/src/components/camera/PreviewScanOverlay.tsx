import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PreviewScanResponse } from '@/types/api';
import type { ScanPoint } from '@/hooks/usePreviewScan';

const BUBBLE_W = 220;
const RING = 64;

interface Props {
  scanning: boolean;
  point: ScanPoint | null;
  result: PreviewScanResponse | null;
  containerW: number;
  containerH: number;
  onDismiss: () => void;
}

/**
 * F19 오버레이. 터치 지점의 로딩 펄스 + 포켓몬고식 결과 라벨.
 * 결과는 잠정치임을 문구로 명확히 안내하고, 위험 판정 시 경고를 강조한다.
 */
export function PreviewScanOverlay({
  scanning,
  point,
  result,
  containerW,
  onDismiss,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!scanning) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    pulse.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [scanning, pulse]);

  if (!point) return null;

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  const bubbleLeft = Math.min(Math.max(point.x - BUBBLE_W / 2, 8), Math.max(containerW - BUBBLE_W - 8, 8));
  const bubbleTop = Math.max(point.y - 132, 8);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* 터치 지점 표시 */}
      <View pointerEvents="none" style={[styles.dot, { left: point.x - 6, top: point.y - 6 }]} />

      {/* 로딩 펄스 */}
      {scanning && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { left: point.x - RING / 2, top: point.y - RING / 2, transform: [{ scale }], opacity },
          ]}
        />
      )}

      {/* 결과 라벨 */}
      {result && (
        <Pressable
          onPress={onDismiss}
          style={[
            styles.bubble,
            { left: bubbleLeft, top: bubbleTop },
            result.is_dangerous ? styles.bubbleDanger : styles.bubbleSafe,
          ]}
        >
          <View style={styles.bubbleHeader}>
            <Text style={styles.bubbleName}>{result.species_guess}</Text>
            <View style={[styles.tag, result.is_dangerous ? styles.tagDanger : styles.tagSafe]}>
              <Text style={[styles.tagText, result.is_dangerous && styles.tagTextLight]}>
                {result.is_dangerous ? '⚠️ 조심!' : '✓ 괜찮아요'}
              </Text>
            </View>
          </View>
          {result.is_dangerous && (
            <Text style={styles.dangerNote}>가까이 가지 말고 멀리서 관찰해요.</Text>
          )}
          <Text style={styles.disclaimer}>
            잠정 추정이에요 · 찍으면 정확히 알려줘요
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: '#fff',
  },
  bubble: {
    position: 'absolute',
    width: BUBBLE_W,
    borderRadius: 18,
    padding: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  bubbleSafe: { backgroundColor: 'rgba(255,255,255,0.96)' },
  bubbleDanger: { backgroundColor: '#FDECEA', borderWidth: 2, borderColor: '#C0453B' },
  bubbleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bubbleName: { fontSize: 17, fontWeight: '800', color: '#3A3330' },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  tagSafe: { backgroundColor: '#D3EDD9' },
  tagDanger: { backgroundColor: '#C0453B' },
  tagText: { fontSize: 12, fontWeight: '800', color: '#3A3330' },
  tagTextLight: { color: '#fff' },
  dangerNote: { fontSize: 13, fontWeight: '700', color: '#C0453B' },
  disclaimer: { fontSize: 11, color: '#9A8F88' },
});
