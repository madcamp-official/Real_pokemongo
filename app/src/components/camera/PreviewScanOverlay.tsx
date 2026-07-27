import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { PreviewScanResponse } from '@/types/api';
import type { ScanPoint } from '@/hooks/usePreviewScan';

const BUBBLE_W = 210;
/** 피사체를 감싸는 조준 링 지름. */
const RING = 84;
const TAIL_H = 12;
/** 말풍선이 화면 위로 잘리지 않도록 남겨 두는 최소 높이. */
const BUBBLE_SAFE_H = 190;

interface Props {
  scanning: boolean;
  point: ScanPoint | null;
  result: PreviewScanResponse | null;
  containerW: number;
  containerH: number;
  onDismiss: () => void;
}

/**
 * F19 오버레이. 터치한 피사체를 조준 링으로 감싸고, 그 위에 꼬리 달린 말풍선으로
 * 잠정 판정을 띄운다(포켓몬고식 라벨).
 *
 * 말풍선은 흰색으로 고정하고 위험 여부는 배지·안내문·링 색으로만 구분한다 —
 * 배경색까지 바꾸면 꼬리 삼각형과 색이 어긋나 이음매가 드러난다.
 * "잠정치" 고지는 CameraScreen 하단 캡션이 상시 담당한다(리스크 3).
 */
export function PreviewScanOverlay({
  scanning,
  point,
  result,
  containerW,
  containerH,
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

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] });

  const ringColor = !result
    ? '#fff'
    : result.is_dangerous
      ? colors.dangerText
      : colors.primary;

  const bubbleLeft = Math.min(
    Math.max(point.x - BUBBLE_W / 2, 12),
    Math.max(containerW - BUBBLE_W - 12, 12)
  );
  // 링 위쪽에 말풍선 아래 모서리를 붙인다(bottom 기준이라 높이를 몰라도 정렬된다).
  const bubbleBottom = Math.min(
    containerH - (point.y - RING / 2 - 4),
    Math.max(containerH - BUBBLE_SAFE_H, 12)
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* 조준 링 */}
      <View
        pointerEvents="none"
        style={[
          styles.ring,
          { left: point.x - RING / 2, top: point.y - RING / 2, borderColor: ringColor },
        ]}
      />

      {/* 스캔 중 펄스 */}
      {scanning && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            styles.pulseRing,
            {
              left: point.x - RING / 2,
              top: point.y - RING / 2,
              transform: [{ scale }],
              opacity,
            },
          ]}
        />
      )}

      {/* 결과 말풍선 */}
      {result && containerH > 0 && (
        <View
          pointerEvents="box-none"
          style={[styles.bubbleWrap, { left: bubbleLeft, bottom: bubbleBottom }]}
        >
          <Pressable onPress={onDismiss} style={styles.bubble} accessibilityRole="button">
            <Text style={styles.bubbleName}>{result.species_guess}</Text>
            <View
              style={[styles.tag, result.is_dangerous ? styles.tagDanger : styles.tagSafe]}
            >
              <Text
                style={[styles.tagText, result.is_dangerous ? styles.tagTextDanger : styles.tagTextSafe]}
              >
                {result.is_dangerous ? '⚠️ 조심해요' : '✓ 안전해요'}
              </Text>
            </View>
            {result.is_dangerous && (
              <Text style={styles.dangerNote}>가까이 가지 말고 멀리서 관찰해요</Text>
            )}
          </Pressable>
          <View style={styles.tail} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
  },
  pulseRing: { borderColor: '#fff' },

  bubbleWrap: { position: 'absolute', width: BUBBLE_W, alignItems: 'center' },
  bubble: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.97)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleName: { fontSize: 18, fontWeight: '900', color: colors.textPrimary, textAlign: 'center' },
  tag: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  tagSafe: { backgroundColor: colors.safeBg },
  tagDanger: { backgroundColor: colors.dangerBg },
  tagText: { fontSize: 13, fontWeight: '800' },
  tagTextSafe: { color: colors.safeText },
  tagTextDanger: { color: colors.dangerText },
  dangerNote: { fontSize: 12, fontWeight: '700', color: colors.dangerText, textAlign: 'center' },

  // 말풍선 아래 꼬리(삼각형) — 색은 말풍선 배경과 맞춘다.
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: TAIL_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255,255,255,0.97)',
  },
});
