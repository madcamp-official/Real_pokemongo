import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { MapPinMarker } from '@/components/map/MapPinMarker';
import type {
  MapBlob,
  MapBlobKind,
  MapPin,
  HomeZone,
} from '@/types/api';

const BLOB_COLOR: Record<MapBlobKind, string> = {
  nature: '#C4E3A6',
  water: '#A9D8EC',
  unexplored: '#D7D0C8',
};

interface Props {
  blobs: MapBlob[];
  pins: MapPin[];
  homeZone: HomeZone | null;
  currentLocation: { x: number; y: number } | null;
  onPinPress: (pin: MapPin) => void;
}

/**
 * 일러스트 스타일 탐험 지도 (F11).
 * 실제 지도가 아닌, 정규화 좌표 기반의 추상 지형(블롭/강/미탐험) + 발견 핀 + 탐험 구역.
 * 프라이버시 우선: 정밀 GPS 대신 흐릿한 구역으로 표현.
 */
export function StylizedMap({ blobs, pins, homeZone, currentLocation, onPinPress }: Props) {
  return (
    <View style={styles.map}>
      {/* 지형 블롭 */}
      {blobs.map((b) => (
        <View
          key={b.id}
          style={[
            styles.blob,
            {
              backgroundColor: BLOB_COLOR[b.kind],
              left: `${(b.cx - b.w / 2) * 100}%`,
              top: `${(b.cy - b.h / 2) * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
              transform: b.rotate ? [{ rotate: `${b.rotate}deg` }] : undefined,
            },
          ]}
        >
          {b.label && <Text style={styles.blobLabel}>{b.label}</Text>}
        </View>
      ))}

      {/* 나만의 탐험 구역 (점선 원) */}
      {homeZone && (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.homeZone,
              {
                left: `${(homeZone.cx - homeZone.radius) * 100}%`,
                top: `${(homeZone.cy - homeZone.radius) * 100}%`,
                width: `${homeZone.radius * 2 * 100}%`,
                aspectRatio: 1,
              },
            ]}
          />
          {homeZone.label && (
            <View
              style={[
                styles.zoneLabel,
                { left: `${homeZone.cx * 100}%`, top: `${(homeZone.cy - homeZone.radius) * 100}%` },
              ]}
            >
              <Text style={styles.zoneLabelText}>{homeZone.label}</Text>
            </View>
          )}
        </>
      )}

      {/* 현재 위치 */}
      {currentLocation && (
        <View
          pointerEvents="none"
          style={[
            styles.currentLoc,
            { left: `${currentLocation.x * 100}%`, top: `${currentLocation.y * 100}%` },
          ]}
        >
          <View style={styles.currentLocInner} />
        </View>
      )}

      {/* 발견 핀 */}
      {pins.map((p) => (
        <MapPinMarker key={p.id} pin={p} onPress={onPinPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, overflow: 'hidden' },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blobLabel: { fontSize: 15, fontWeight: '800', color: '#8A8078' },
  homeZone: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(240,138,110,0.06)',
  },
  zoneLabel: {
    position: 'absolute',
    marginLeft: -60,
    marginTop: -16,
    width: 120,
    alignItems: 'center',
  },
  zoneLabelText: {
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  currentLoc: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 9,
    backgroundColor: 'rgba(94,169,216,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#5EA9D8',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
