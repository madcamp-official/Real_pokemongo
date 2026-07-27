import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

/**
 * 앱 고유 엠블럼("네이처 볼").
 * 지도 하단 중앙에서 방사형 메뉴를 여는 버튼의 얼굴이자, 앱을 대표하는 문양.
 * 위쪽은 코랄, 아래쪽은 크림, 가운데에 잎사귀 코어를 둔다.
 */
interface Props {
  size?: number;
}

export function NatureBall({ size = 68 }: Props) {
  const band = Math.max(3, size * 0.055);
  const core = size * 0.38;

  return (
    <View
      style={[
        styles.ball,
        { width: size, height: size, borderRadius: size / 2, borderWidth: size * 0.05 },
      ]}
    >
      <View style={styles.top} />
      <View style={styles.bottom} />
      <View style={[styles.band, { height: band, top: size / 2 - band / 2 }]} />
      <View
        style={[
          styles.core,
          {
            width: core,
            height: core,
            borderRadius: core / 2,
            top: size / 2 - core / 2,
            left: size / 2 - core / 2,
            borderWidth: band * 0.8,
          },
        ]}
      >
        <Text style={{ fontSize: core * 0.55 }}>🌿</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ball: {
    borderColor: '#fff',
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  top: { flex: 1, backgroundColor: colors.primary },
  bottom: { flex: 1, backgroundColor: '#FFF7F0' },
  band: { position: 'absolute', left: 0, right: 0, backgroundColor: '#3A3330' },
  core: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderColor: '#3A3330',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
