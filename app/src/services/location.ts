import * as Location from 'expo-location';

export interface Coord {
  lat: number;
  lng: number;
}

export type StopLocationWatch = () => void;

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

/**
 * 지도 화면이 보이는 동안만 전경 위치를 추적한다.
 *
 * 2m 이상 이동하거나 약 1.5초가 지나면 좌표를 갱신해 걷는 움직임은 자연스럽게
 * 보이면서도 GPS·배터리를 과도하게 사용하지 않는다. 호출자는 화면을 떠날 때
 * 반환된 함수를 반드시 실행해 구독을 해제한다.
 */
export async function watchForegroundLocation(
  onLocation: (coord: Coord) => void,
): Promise<StopLocationWatch | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 30_000,
      requiredAccuracy: 100,
    });
    if (lastKnown) {
      onLocation({
        lat: lastKnown.coords.latitude,
        lng: lastKnown.coords.longitude,
      });
    }

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 1_500,
        distanceInterval: 2,
      },
      (position) => {
        onLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
    );
    return () => subscription.remove();
  } catch {
    return null;
  }
}
