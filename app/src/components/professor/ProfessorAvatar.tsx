import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  thinking?: boolean;
  warning?: boolean;
};

/**
 * 도감 박사 전용 캐릭터.
 * 생성 원화는 이 컴포넌트에서만 참조해 화면마다 서로 다른 임시 아이콘이 생기지 않게 한다.
 */
export function ProfessorAvatar({ thinking = false, warning = false }: Props) {
  return (
    <View style={styles.frame}>
      <View style={[styles.halo, warning && styles.warningHalo]} />
      <Image
        source={require('../../../assets/professor/dex-professor.png')}
        style={[styles.character, thinking && styles.thinkingCharacter]}
        resizeMode="contain"
        accessibilityLabel="안경을 쓰고 생태 도감을 든 부엉이 박사"
      />
      {thinking && (
        <View style={styles.thinkingPill}>
          <Text style={styles.thinkingText}>● ● ●</Text>
        </View>
      )}
      {warning && (
        <View style={styles.warningBadge}>
          <Text style={styles.warningText}>!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 126,
    height: 154,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    top: 12,
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#E5F0DC',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  warningHalo: { backgroundColor: '#FBE2D8' },
  character: {
    width: 126,
    height: 154,
  },
  thinkingCharacter: { opacity: 0.78 },
  thinkingPill: {
    position: 'absolute',
    bottom: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    shadowColor: '#273A2D',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thinkingText: { color: '#52735B', fontSize: 7, letterSpacing: 1.5 },
  warningBadge: {
    position: 'absolute',
    right: 4,
    top: 11,
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: '#E66E55',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});

