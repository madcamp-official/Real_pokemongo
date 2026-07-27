import { Pressable, StyleSheet, Text } from 'react-native';
import { cameraTheme } from '@/theme/colors';

/**
 * 카메라 위에 얹히는 원형 아이콘 버튼 (F2 "탐험 모드" 상단/하단 컨트롤).
 * 켜짐 상태는 코랄로 채워 한눈에 구분되게 한다.
 */
interface Props {
  icon: string;
  label: string;
  active?: boolean;
  size?: number;
  onPress: () => void;
}

export function ControlButton({ icon, label, active, size = 46, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        active && styles.active,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.icon, { fontSize: size * 0.42 }]}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cameraTheme.control,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  active: { backgroundColor: cameraTheme.controlActive, borderColor: 'rgba(255,255,255,0.6)' },
  pressed: { opacity: 0.7 },
  icon: { color: '#fff' },
});
