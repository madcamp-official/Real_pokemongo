import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';

interface Props {
  onPress: () => void;
  /** pill: 지도/도감/방사형 메뉴의 상시 진입점(부동 버튼). card: 종 카드처럼 목록 안에 인라인으로 놓일 때. */
  variant?: 'pill' | 'card';
  /** card 변형에서만 쓰는 보조 설명. pill은 항상 같은 문구를 쓴다(진입점 형태 통일). */
  caption?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * "아울 박사"에게 질문하는 상시 진입점 — 지도 홈·도감·방사형 메뉴·종 카드에서
 * 서로 다른 아이콘("?" 원, 텍스트만 있는 FAB 등)과 문구("도감 박사")를 각자
 * 구현하고 있던 걸 하나로 합쳤다(2026-07-30). 인트로 컷씬에 등장한 부엉이와
 * 같은 그림(dex-professor-avatar.png)을 항상 함께 보여줘, "그 박사에게 다시
 * 물어보러 왔다"는 느낌이 이어지게 한다. 위치는 화면마다 주변 UI에 맞게
 * 호출부에서 style로 지정하고, 이 컴포넌트는 생김새만 책임진다.
 */
export function ProfessorEntryPoint({ onPress, variant = 'pill', caption, style }: Props) {
  const isCard = variant === 'card';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="아울 박사에게 질문하기"
      style={({ pressed }) => [
        isCard ? styles.card : styles.pill,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={isCard ? styles.cardAvatar : styles.pillAvatar}>
        <Image
          source={require('../../../assets/professor/dex-professor-avatar.png')}
          style={isCard ? styles.cardAvatarImage : styles.pillAvatarImage}
          resizeMode="contain"
        />
      </View>
      {isCard ? (
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>아울 박사에게 묻기</Text>
          {caption && <Text style={styles.cardCaption}>{caption}</Text>}
        </View>
      ) : (
        <View>
          <Text style={styles.pillEyebrow}>궁금한 게 있나요?</Text>
          <Text style={styles.pillTitle}>아울 박사</Text>
        </View>
      )}
      {isCard && <Text style={styles.cardArrow}>›</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },

  // ── pill: 지도/도감/방사형 메뉴의 부동 진입점 ───────────────────────
  pill: {
    minHeight: 54,
    paddingLeft: 4,
    paddingRight: 14,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 2,
    borderColor: colors.primaryLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#203B2B',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  pillAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: colors.primaryLight,
  },
  pillAvatarImage: { width: 46, height: 46 },
  pillEyebrow: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  pillTitle: { color: colors.primaryDark, fontSize: 14, fontWeight: '900' },

  // ── card: 종 카드 등 목록 안에 인라인으로 놓이는 변형 ───────────────
  card: {
    minHeight: 72,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cardAvatarImage: { width: 48, height: 48 },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.primaryDark, fontSize: 15, fontWeight: '900' },
  cardCaption: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  cardArrow: { color: colors.primaryDark, fontSize: 28, lineHeight: 28 },
});
