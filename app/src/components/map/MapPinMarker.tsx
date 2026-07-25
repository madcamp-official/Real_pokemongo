import { Pressable, StyleSheet, View } from 'react-native';
import type { MapPin, TaxonGroup } from '@/types/api';

const PIN_COLOR: Record<TaxonGroup, string> = {
  곤충: '#F08A6E',
  양서류: '#5EA9D8',
  식물: '#7FB86A',
  기타: '#B0A79E',
};

const SIZE = 34;

/**
 * 지도 발견 핀 (F11). 티어드롭 모양 + 흰 점, 분류 그룹별 색상.
 * 정규화 좌표를 퍼센트 위치로 배치하고 탭 시 콜백.
 */
interface Props {
  pin: MapPin;
  onPress: (pin: MapPin) => void;
}

export function MapPinMarker({ pin, onPress }: Props) {
  const color = PIN_COLOR[pin.group];
  return (
    <Pressable
      onPress={() => onPress(pin)}
      style={[
        styles.wrapper,
        { left: `${pin.x * 100}%`, top: `${pin.y * 100}%` },
      ]}
      hitSlop={8}
    >
      <View style={[styles.pin, { backgroundColor: color }]}>
        <View style={styles.dot} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    // 핀의 아래 꼭짓점이 좌표를 가리키도록 위로/왼쪽으로 당김
    marginLeft: -SIZE / 2,
    marginTop: -SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderBottomRightRadius: 2,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    transform: [{ rotate: '-45deg' }],
  },
});
