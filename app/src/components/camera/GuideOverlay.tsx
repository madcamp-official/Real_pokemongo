import { StyleSheet, View } from 'react-native';

/**
 * 촬영 프레이밍 가이드 (F2).
 * 중앙 네 모서리 가이드만 담당한다. 안내 문구는 CameraScreen 하단 힌트 알약이
 * 맡는다(상단에 겹쳐 그리면 게스트 배지·컨트롤과 충돌해 분리).
 */
interface Props {
  /** F8 레벨업 언락 시 프레임 강조색(기본은 흰색). 예: 골드 프레임. */
  accentColor?: string;
}

export function GuideOverlay({ accentColor }: Props) {
  const cornerColor = accentColor ?? DEFAULT_COLOR;
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.frame}>
        <View style={[styles.corner, styles.tl, { borderColor: cornerColor }]} />
        <View style={[styles.corner, styles.tr, { borderColor: cornerColor }]} />
        <View style={[styles.corner, styles.bl, { borderColor: cornerColor }]} />
        <View style={[styles.corner, styles.br, { borderColor: cornerColor }]} />
      </View>
    </View>
  );
}

const CORNER = 30;
const BORDER = 3;
const RADIUS = 14;
// 스캔 말풍선과 겹쳐도 시선을 뺏지 않도록 기존보다 옅게 잡는다.
const DEFAULT_COLOR = 'rgba(255,255,255,0.72)';

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
  frame: { width: '70%', aspectRatio: 1, maxWidth: 300 },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  tl: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: RADIUS },
  tr: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: RADIUS },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: RADIUS },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: RADIUS },
});
