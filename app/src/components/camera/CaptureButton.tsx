import { Pressable, StyleSheet, Text, View } from 'react-native';

export type CaptureMode = 'single' | 'burst';

/**
 * 초대형 셔터 버튼 + 단일/버스트 모드 토글 (F2).
 * 아동 대상이라 터치 타깃을 크게 잡는다.
 */
interface Props {
  mode: CaptureMode;
  disabled?: boolean;
  onCapture: () => void;
  onToggleMode: () => void;
}

export function CaptureButton({ mode, disabled, onCapture, onToggleMode }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.side} />

      <Pressable
        onPress={onCapture}
        disabled={disabled}
        style={({ pressed }) => [
          styles.shutterOuter,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="촬영"
      >
        <View style={styles.shutterInner} />
      </Pressable>

      <View style={styles.side}>
        <Pressable
          onPress={onToggleMode}
          disabled={disabled}
          style={styles.modeToggle}
          accessibilityRole="button"
          accessibilityLabel={mode === 'single' ? '단일 촬영' : '버스트 촬영'}
        >
          <Text style={styles.modeText}>{mode === 'single' ? '단일' : '연속'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: 72, alignItems: 'center', justifyContent: 'center' },
  shutterOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  pressed: { transform: [{ scale: 0.92 }] },
  disabled: { opacity: 0.5 },
  modeToggle: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
