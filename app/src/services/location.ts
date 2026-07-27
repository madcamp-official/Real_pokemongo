import * as Location from 'expo-location';

export interface Coord {
  lat: number;
  lng: number;
}

/**
 * 위치 권한을 '별도로' 요청하고 현재 좌표를 반환한다 (F2).
 * 카메라 권한과 분리해서, 위치를 거부해도 촬영은 계속 가능하도록 설계한다.
 * 프라이버시 우선: 사용자가 위치 첨부를 켰을 때만 이 함수를 호출한다.
 */
export async function requestLocationAndGet(): Promise<Coord | null> {
  // 촬영 경로에서 항상 호출되므로 어떤 실패도 예외로 새어나가면 안 된다 —
  // 위치를 못 얻는 건 촬영을 통째로 잃을 이유가 되지 못한다(핀만 안 남을 뿐).
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
