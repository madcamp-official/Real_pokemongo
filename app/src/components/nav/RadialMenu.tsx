import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { NatureBall } from '@/components/nav/NatureBall';
import { colors } from '@/theme/colors';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';

type Nav = BottomTabNavigationProp<RootTabParamList>;

interface MenuItem {
  route: keyof RootTabParamList;
  label: string;
  icon: string;
}

const ITEMS: MenuItem[] = [
  { route: 'Dex', label: '도감', icon: '📖' },
  { route: 'Camera', label: '촬영', icon: '📷' },
  { route: 'Sound', label: '소리 찾기', icon: '🎙️' },
  { route: 'Garden', label: '홈 가든', icon: '🌿' },
  { route: 'Rewards', label: '퀘스트', icon: '🏆' },
];

/** 메뉴 배경(연녹색 그라데이션) — 포켓몬고 메인 메뉴 톤. */
const MENU_BG = ['#D8F0C6', '#EFF9E4', '#E2F5D3'] as const;

const EMBLEM_SIZE = 72;
const CIRCLE = 72;
const WRAP_WIDTH = 104;
/** 엠블럼(닫힌 버튼) 중심에서 각 항목 원 중심까지의 거리. */
const ARC_RADIUS = 136;
/** 항목들이 펼쳐지는 전체 각도(도). 수직(위쪽)을 기준으로 좌우 대칭. */
const ARC_SPAN_DEG = 120;

interface ArcPoint {
  /** 엠블럼 중심 기준 좌우 거리(오른쪽이 +). */
  dx: number;
  /** 엠블럼 중심 기준 위쪽으로 뜬 거리(양수 = 위). */
  up: number;
}

/** N개 항목을 엠블럼 중심 위로 부채꼴 호를 따라 균등 배치한다(끝 항목이 안쪽 항목보다 낮게). */
function computeArc(count: number): ArcPoint[] {
  if (count <= 1) return [{ dx: 0, up: ARC_RADIUS }];
  const step = ARC_SPAN_DEG / (count - 1);
  const start = -ARC_SPAN_DEG / 2;
  return Array.from({ length: count }, (_, i) => {
    const angleRad = ((start + i * step) * Math.PI) / 180;
    return {
      dx: ARC_RADIUS * Math.sin(angleRad),
      up: ARC_RADIUS * Math.cos(angleRad),
    };
  });
}

const ARC_POINTS = computeArc(ITEMS.length);

/**
 * 지도 하단 중앙 엠블럼을 누르면 펼쳐지는 방사형 메뉴.
 * 하단 탭 바를 대체하며, 설정은 우상단에 따로 둔다(포켓몬고와 동일한 배치).
 *
 * 항목은 flex row가 아니라 엠블럼 중심을 기준으로 한 실제 원호(arc) 좌표로
 * 절대배치한다 — 항목 하나만 위로 띄우는 방식은 개수가 늘어나면 들쭉날쭉해
 * 보이므로(4개일 때 실측), 전체를 같은 반지름 위에서 각도로 나눠 진짜
 * 부채꼴 모양이 나오게 한다.
 */
export function RadialMenu() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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

  const openProfessor = () => {
    setOpen(false);
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('Professor');
  };

  // 엠블럼(닫힌 버튼) 중심 좌표 — 항목들이 여기서 부채꼴로 펼쳐져 나온다.
  const pivotX = width / 2;
  const pivotBottom = insets.bottom + 18 + EMBLEM_SIZE / 2;

  const itemLayouts = useMemo(
    () =>
      ITEMS.map((item, i) => {
        const { dx, up } = ARC_POINTS[i];
        return {
          item,
          // 최종(펼쳐진) 위치: 원 중심이 (pivotX+dx, pivotBottom+up)에 오도록.
          left: pivotX + dx - WRAP_WIDTH / 2,
          bottom: pivotBottom + up - CIRCLE / 2,
          dx,
          up,
        };
      }),
    [pivotX, pivotBottom],
  );

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
        <NatureBall size={EMBLEM_SIZE} />
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

          <Pressable
            onPress={openProfessor}
            accessibilityRole="button"
            accessibilityLabel="도감 박사"
            style={({ pressed }) => [
              styles.professorMenu,
              { top: insets.top + 14 },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.professorMenuAvatar}>
              <Image
                source={require('../../../assets/professor/dex-professor-avatar.png')}
                style={styles.professorMenuImage}
                resizeMode="contain"
              />
            </View>
            <View>
              <Text style={styles.professorMenuEyebrow}>생태 질문</Text>
              <Text style={styles.professorMenuTitle}>도감 박사</Text>
            </View>
          </Pressable>

          {/* 부채꼴로 펼쳐지는 메뉴 항목 — 엠블럼 위치에서 각자의 호 좌표로 날아간다. */}
          {itemLayouts.map(({ item, left, bottom, dx, up }) => {
            const itemStyle = {
              opacity: progress,
              transform: [
                // 닫힘(0)일 땐 엠블럼 중심으로 되돌아가고, 열림(1)일 땐 제자리(0,0).
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-dx, 0] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [up, 0] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              ],
            };
            return (
              <Animated.View
                key={item.route}
                style={[styles.itemWrap, { left, bottom }, itemStyle]}
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
            );
          })}

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

  professorMenu: {
    position: 'absolute',
    left: 18,
    minHeight: 54,
    paddingLeft: 4,
    paddingRight: 14,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: 'rgba(122,163,113,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  professorMenuAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#E7F1DF',
  },
  professorMenuImage: { width: 44, height: 44 },
  professorMenuEyebrow: { color: '#7B927C', fontSize: 9, fontWeight: '800' },
  professorMenuTitle: { color: '#365A3D', fontSize: 14, fontWeight: '900' },

  itemWrap: {
    position: 'absolute',
    width: WRAP_WIDTH,
    alignItems: 'center',
    gap: 8,
  },
  itemLabel: { fontSize: 14, fontWeight: '800', color: '#3F6340', textAlign: 'center' },
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
  itemIcon: { fontSize: 30 },

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
