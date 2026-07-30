import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/**
 * 촬영 직후 로딩 연출 (F2).
 * 촬영본 저장·업로드 준비 동안 표시. 회전 링 + 안내 문구.
 */
interface Props {
  visible: boolean;
  label?: string;
}

export function CapturingLoader({ visible, label = '담는 중...' }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.label}>{label}</Text>
      </View>
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
  card: {
    minWidth: 144,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(20,22,26,0.78)',
  },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
