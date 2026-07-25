import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

/**
 * 레벨업 축하 연출 (F8). 배지·퀘스트 보상 수령으로 레벨업했을 때 짧게 표시.
 */
interface Props {
  visible: boolean;
  level: number;
  onDone: () => void;
}

const DISPLAY_MS = 1800;

export function LevelUpCelebration({ visible, level, onDone }: Props) {
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.6);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [visible, scale, onDone]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.sparkle}>🎉</Text>
          <Text style={styles.title}>레벨 업!</Text>
          <Text style={styles.level}>Lv.{level}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    paddingHorizontal: 48,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 6,
  },
  sparkle: { fontSize: 44, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  level: { fontSize: 32, fontWeight: '800', color: colors.primary },
});
