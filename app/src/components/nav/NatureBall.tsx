import { StyleSheet, View } from 'react-native';

/**
 * 앱 고유 엠블럼("네이처 코어").
 * 자연 관찰의 시작점을 뜻하는 숲색 원형 버튼으로 지도 화면의 기준 컨트롤이 된다.
 */
interface Props {
  size?: number;
}

export function NatureBall({ size = 68 }: Props) {
  return (
    <View
      style={[
        styles.core,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: Math.max(3, size * 0.045),
        },
      ]}
    >
      <View style={[styles.sprout, { width: size * 0.34, height: size * 0.38 }]}>
        <View style={styles.stem} />
        <View style={[styles.leaf, styles.leafLeft]} />
        <View style={[styles.leaf, styles.leafRight]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  core: {
    backgroundColor: '#287154',
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#30452D',
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  sprout: { alignItems: 'center', justifyContent: 'flex-end' },
  stem: { width: 3, height: '56%', borderRadius: 2, backgroundColor: '#FFFFFF' },
  leaf: {
    position: 'absolute',
    top: '4%',
    width: '52%',
    height: '48%',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    borderRadius: 999,
  },
  leafLeft: { left: '1%', transform: [{ rotate: '-37deg' }] },
  leafRight: { right: '1%', transform: [{ rotate: '37deg' }] },
});
