import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';

/**
 * 초대형 셔터 버튼 (F2).
 * 누르는 동안 계속 촬영되고 떼면 끝난다 — 톡 누르면 한 장, 꾹 누르면 연속.
 * 아동 대상이라 터치 타깃을 크게 잡고, 누르는 중임을 코랄 링으로 분명히 보여준다.
 */
interface Props {
  /** 누르고 있는 중인지 — 시각 피드백에만 쓴다. */
  holding?: boolean;
  disabled?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function CaptureButton({ holding, disabled, onPressIn, onPressOut }: Props) {
  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      style={[styles.shutterOuter, holding && styles.shutterOuterHolding, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel="촬영 — 누르고 있으면 연속으로 담아요"
    >
      <View style={[styles.shutterInner, holding && styles.shutterInnerHolding]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shutterOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterHolding: { borderColor: colors.primary },
  shutterInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#fff' },
  // 누르는 동안 안쪽 원이 작아지며 코랄로 — "지금 담고 있어요" 신호.
  shutterInnerHolding: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary },
  disabled: { opacity: 0.5 },
});
