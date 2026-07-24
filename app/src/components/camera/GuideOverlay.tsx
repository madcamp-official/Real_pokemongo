import { StyleSheet, Text, View } from 'react-native';

/**
 * 촬영 가이드 오버레이 (F2).
 * 중앙 프레이밍 가이드 + 상황별 힌트(근접/흔들림) 안내.
 * Phase 1에서는 정적 프레임 + 안내 카피. 실시간 흔들림/근접 감지는 F19(프리뷰 스캔)와
 * 함께 후속 고도화 대상.
 */
interface Props {
  hint?: string;
}

export function GuideOverlay({ hint = '생물을 가운데 담아요' }: Props) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.topHint}>
        <Text style={styles.hintText}>{hint}</Text>
      </View>

      {/* 중앙 프레이밍 가이드 (네 모서리) */}
      <View style={styles.frame}>
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
      </View>
    </View>
  );
}

const CORNER = 28;
const BORDER = 3;
const COLOR = 'rgba(255,255,255,0.9)';

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHint: {
    position: 'absolute',
    top: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
  },
  hintText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  frame: { width: '72%', aspectRatio: 1, maxWidth: 320 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: COLOR },
  tl: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 8 },
});
