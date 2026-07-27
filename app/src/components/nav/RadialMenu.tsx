import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NatureBall } from '@/components/nav/NatureBall';
import { colors } from '@/theme/colors';
import type { RootTabParamList } from '@/navigation/types';

type Nav = BottomTabNavigationProp<RootTabParamList>;

interface MenuItem {
  route: keyof RootTabParamList;
  label: string;
  icon: string;
  /** 가운데 항목은 한 단 높게 띄워 부채꼴처럼 보이게 한다. */
  raised?: boolean;
}

const ITEMS: MenuItem[] = [
  { route: 'Dex', label: '도감', icon: '📖' },
  { route: 'Camera', label: '촬영', icon: '📷', raised: true },
  { route: 'Garden', label: '홈 가든', icon: '🌿' },
];

/** 메뉴 배경(연녹색 그라데이션) — 포켓몬고 메인 메뉴 톤. */
const MENU_BG = ['#D8F0C6', '#EFF9E4', '#E2F5D3'] as const;

/**
 * 지도 하단 중앙 엠블럼을 누르면 펼쳐지는 방사형 메뉴.
 * 하단 탭 바를 대체하며, 설정은 우상단에 따로 둔다(포켓몬고와 동일한 배치).
 */
export function RadialMenu() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [open, setOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 260 : 160,
      easing: open ? Easing.out(Easing.back(1.6)) : Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const go = (route: keyof RootTabParamList) => {
    setOpen(false);
    navigation.navigate(route);
  };

  const itemStyle = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
    ],
  };

  return (
    <>
      {/* 접힌 상태: 지도 위에 뜬 엠블럼 버튼 */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="메뉴 열기"
        style={({ pressed }) => [
          styles.emblemButton,
          { bottom: insets.bottom + 18 },
          pressed && styles.pressed,
        ]}
      >
        <NatureBall size={72} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <LinearGradient colors={MENU_BG} style={StyleSheet.absoluteFill} />

          {/* 우상단: 설정 (탭 바에서 빼고 여기로 옮김) */}
          <View style={[styles.topRight, { top: insets.top + 16 }]}>
            <Pressable
              onPress={() => go('Settings')}
              accessibilityRole="button"
              accessibilityLabel="설정"
              style={({ pressed }) => [styles.topRightRow, pressed && styles.pressed]}
            >
              <Text style={styles.topRightLabel}>설정</Text>
              <View style={styles.topRightCircle}>
                <Text style={styles.topRightIcon}>⚙️</Text>
              </View>
            </Pressable>
          </View>

          {/* 부채꼴로 펼쳐지는 메뉴 항목 */}
          <View style={styles.itemsRow}>
            {ITEMS.map((item) => (
              <Animated.View
                key={item.route}
                style={[styles.itemWrap, item.raised && styles.itemRaised, itemStyle]}
              >
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Pressable
                  onPress={() => go(item.route)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={({ pressed }) => [styles.itemCircle, pressed && styles.pressed]}
                >
                  <Text style={styles.itemIcon}>{item.icon}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>

          {/* 닫기 — 엠블럼이 있던 자리에서 ✕ 로 바뀐 것처럼 보이게 같은 위치에 둔다 */}
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="메뉴 닫기"
            style={({ pressed }) => [
              styles.closeButton,
              { bottom: insets.bottom + 18 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const CIRCLE = 84;

const styles = StyleSheet.create({
  emblemButton: { position: 'absolute', alignSelf: 'center', zIndex: 20 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },

  overlay: { flex: 1 },

  topRight: { position: 'absolute', right: 20 },
  topRightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topRightLabel: { fontSize: 15, fontWeight: '700', color: '#4A6B47' },
  topRightCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(122,163,113,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRightIcon: { fontSize: 20 },

  itemsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 26,
    paddingBottom: 190,
  },
  itemWrap: { alignItems: 'center', gap: 10 },
  itemRaised: { marginBottom: 52 },
  itemLabel: { fontSize: 15, fontWeight: '800', color: '#3F6340' },
  itemCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2.5,
    borderColor: 'rgba(122,163,113,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B7A50',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  itemIcon: { fontSize: 36 },

  closeButton: {
    position: 'absolute',
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2.5,
    borderColor: 'rgba(122,163,113,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 26, fontWeight: '700', color: colors.textSecondary },
});
