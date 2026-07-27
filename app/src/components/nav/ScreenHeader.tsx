import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { colors } from '@/theme/colors';
import type { RootTabParamList } from '@/navigation/types';

/**
 * 지도(홈)에서 펼쳐 들어온 화면들의 공통 헤더.
 * 하단 탭 바를 없앴으므로 각 화면은 지도로 돌아갈 길을 스스로 갖고 있어야 한다.
 */
interface Props {
  title: string;
  /** 우측에 놓을 보조 액션(선택). */
  right?: React.ReactNode;
}

export function ScreenHeader({ title, right }: Props) {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => navigation.navigate('Map')}
        accessibilityRole="button"
        accessibilityLabel="지도로 돌아가기"
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: -4 },
  pressed: { opacity: 0.7 },
  title: { flex: 1, fontSize: 24, fontWeight: '900', color: colors.textPrimary },
  right: { minWidth: 0 },
});
