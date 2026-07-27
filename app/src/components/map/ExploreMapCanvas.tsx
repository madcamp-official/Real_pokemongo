import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors } from '@/theme/colors';
import type { MapPin, TaxonGroup } from '@/types/api';

/** 분류군별 핀 색. 시안의 초록/코랄/파랑 핀 조합을 그대로 쓴다. */
const GROUP_COLOR: Record<TaxonGroup, string> = {
  곤충: '#F0705A',
  양서류: '#4FA3D9',
  식물: '#6BAE5A',
  기타: '#A88F7D',
};

/** 위경도 범위가 너무 좁을 때의 최소 스팬(약 400m) — 한 점만 있어도 과확대되지 않게. */
const MIN_SPAN = 0.004;
const PAD = 56;

interface Coord {
  lat: number;
  lng: number;
}

interface Props {
  pins: MapPin[];
  currentLocation: Coord | null;
  onPinPress: (speciesId: string) => void;
}

/**
 * F11 탐험 지도 — 일러스트 스타일 캔버스.
 *
 * 실제 지도 타일 대신 손그림풍 지형(숲/물/미탐험 구역) 위에 발견 핀을 얹는다.
 * 아동 대상이라 정밀한 지리 정보보다 "내가 다닌 곳"이라는 감각이 중요하고,
 * 외부 지도 SDK(WebView·API 키·도메인 등록)에 의존하지 않아 오프라인에서도 깨지지 않는다.
 * 핀 좌표는 실제 위경도를 캔버스 범위에 정규화해 배치한다.
 */
export function ExploreMapCanvas({ pins, currentLocation, onPinPress }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const placed = projectPoints(pins, currentLocation, size.w, size.h);

  return (
    <View style={styles.canvas} onLayout={onLayout}>
      {/* ── 지형(장식) ─────────────────────────────────────────── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blob, styles.forestA]} />
        <View style={[styles.blob, styles.forestB]} />
        <View style={[styles.blob, styles.forestC]} />
        <View style={styles.river} />
        <View style={[styles.blob, styles.pond]} />
        <View style={[styles.blob, styles.unknown]}>
          <Text style={styles.unknownText}>아직 안 가본 곳</Text>
        </View>
      </View>

      {size.w > 0 && (
        <>
          {/* ── 나만의 탐험 구역 (현재 위치 주변) ──────────────── */}
          {placed.current && (
            <View
              pointerEvents="none"
              style={[
                styles.homeZone,
                { left: placed.current.x - ZONE / 2, top: placed.current.y - ZONE / 2 },
              ]}
            >
              <View style={styles.homeZoneLabel}>
                <Text style={styles.homeZoneLabelText}>나만의 탐험 구역</Text>
              </View>
            </View>
          )}

          {/* ── 발견 핀 ─────────────────────────────────────────── */}
          {placed.pins.map((p) => (
            <Pressable
              key={`${p.pin.species_id}-${p.x}-${p.y}`}
              onPress={() => onPinPress(p.pin.species_id)}
              accessibilityRole="button"
              accessibilityLabel={`${p.pin.species_name} 발견 위치`}
              style={({ pressed }) => [
                styles.pin,
                { left: p.x - PIN_W / 2, top: p.y - PIN_H },
                pressed && styles.pinPressed,
              ]}
            >
              <View
                style={[styles.pinHead, { backgroundColor: GROUP_COLOR[p.pin.group] ?? GROUP_COLOR.기타 }]}
              >
                <View style={styles.pinDot} />
              </View>
              <View
                style={[
                  styles.pinTail,
                  { borderTopColor: GROUP_COLOR[p.pin.group] ?? GROUP_COLOR.기타 },
                ]}
              />
            </Pressable>
          ))}

          {/* ── 현재 위치 ───────────────────────────────────────── */}
          {placed.current && (
            <View
              pointerEvents="none"
              style={[styles.meWrap, { left: placed.current.x - 11, top: placed.current.y - 11 }]}
            >
              <View style={styles.meDot} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

interface Placed {
  pins: { pin: MapPin; x: number; y: number }[];
  current: { x: number; y: number } | null;
}

/** 위경도를 캔버스 픽셀 좌표로 정규화한다(북쪽이 위). */
function projectPoints(
  pins: MapPin[],
  current: Coord | null,
  w: number,
  h: number
): Placed {
  const all: Coord[] = [...pins, ...(current ? [current] : [])];
  if (w <= 0 || h <= 0 || all.length === 0) return { pins: [], current: null };

  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), MIN_SPAN);
  const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), MIN_SPAN);

  const innerW = Math.max(w - PAD * 2, 1);
  const innerH = Math.max(h - PAD * 2, 1);

  const toXY = (c: Coord) => ({
    x: PAD + ((c.lng - (midLng - spanLng / 2)) / spanLng) * innerW,
    // 위도는 북쪽이 클수록 화면 위쪽이라 y축을 뒤집는다.
    y: PAD + (((midLat + spanLat / 2) - c.lat) / spanLat) * innerH,
  });

  return {
    pins: pins.map((pin) => ({ pin, ...toXY(pin) })),
    current: current ? toXY(current) : null,
  };
}

const PIN_W = 42;
const PIN_H = 52;
const ZONE = 190;

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#EDF5E2', overflow: 'hidden' },

  blob: { position: 'absolute' },
  forestA: {
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#C6E3A8',
    opacity: 0.85,
    left: -70,
    top: 40,
  },
  forestB: {
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#B7DC97',
    opacity: 0.8,
    right: -60,
    top: 230,
  },
  forestC: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#CFE9B4',
    opacity: 0.9,
    left: 90,
    bottom: 60,
  },
  river: {
    position: 'absolute',
    width: 460,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#A9D6EE',
    opacity: 0.85,
    left: -80,
    top: 130,
    transform: [{ rotate: '28deg' }],
  },
  pond: {
    width: 200,
    height: 160,
    borderRadius: 100,
    backgroundColor: '#A9D6EE',
    opacity: 0.75,
    left: -40,
    bottom: -30,
  },
  unknown: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#D6D2C6',
    opacity: 0.75,
    right: -50,
    top: -30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknownText: { fontSize: 14, fontWeight: '800', color: '#7C766A', marginRight: 30, marginTop: 40 },

  homeZone: {
    position: 'absolute',
    width: ZONE,
    height: ZONE,
    borderRadius: ZONE / 2,
    borderWidth: 2.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(240,138,110,0.07)',
    alignItems: 'center',
  },
  homeZoneLabel: {
    position: 'absolute',
    top: -16,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 13,
  },
  homeZoneLabelText: { color: colors.onPrimary, fontSize: 12, fontWeight: '800' },

  pin: { position: 'absolute', width: PIN_W, alignItems: 'center' },
  pinPressed: { transform: [{ scale: 0.9 }] },
  pinHead: {
    width: PIN_W,
    height: PIN_W,
    borderRadius: PIN_W / 2,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  pinDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#fff' },
  pinTail: {
    width: 0,
    height: 0,
    marginTop: -3,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  meWrap: { position: 'absolute' },
  meDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3E90D6',
    borderWidth: 3.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
