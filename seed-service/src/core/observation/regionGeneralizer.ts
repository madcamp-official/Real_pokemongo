/**
 * 위치 일반화 (명세서 F12 / §8: 프라이버시 우선).
 *
 * 앱(클라이언트)에서 정밀 GPS가 들어오더라도, 서버 도메인 경계를 넘기 전에
 * **행정구역 코드(시·군·구)로 일반화하고 원본 좌표는 폐기**한다.
 * Observation 타입에는 애초에 좌표 필드가 없다(스키마 강제). 이 함수는 그 경계에서
 * 좌표 → regionCode 변환을 담당한다.
 *
 * TODO(제공 필요): 실제 역지오코딩(좌표→시군구코드).
 *   옵션 A) 국내 행정경계 GeoJSON 을 앱 내장 → 클라이언트에서 변환(좌표가 서버에 안 옴, 최선).
 *   옵션 B) 서버측 역지오코딩 서비스(SPECIES/GEO API). 이 경우에도 원본 좌표는 즉시 폐기.
 */
import type { ObservedRegion } from "../domain/types.js";

export interface RawCoordinate {
  lat: number;
  lng: number;
}

export interface Geocoder {
  /** 좌표를 시·군·구 코드로. 실패 시 null. */
  toRegion(coord: RawCoordinate): Promise<ObservedRegion | null>;
}

/**
 * 개발용 스텁 지오코더. 실제 경계 데이터 없이, 좌표를 저해상도 격자로 뭉개
 * "정밀 좌표를 저장하지 않는다"는 계약만 지킨다. 프로덕션에서 교체.
 */
export class StubGridGeocoder implements Geocoder {
  async toRegion(coord: RawCoordinate): Promise<ObservedRegion | null> {
    // 소수점 1자리(~11km 격자)로 뭉갠 값을 코드처럼 사용. 실제 행정코드 아님.
    const gLat = coord.lat.toFixed(1);
    const gLng = coord.lng.toFixed(1);
    return {
      regionCode: `GRID_${gLat}_${gLng}`,
      regionLabel: undefined,
    };
  }
}

/**
 * 위치 저장 정책을 적용해 최종 저장할 ObservedRegion 을 만든다.
 * - 보호자가 위치 저장을 껐으면(기본값) 무조건 null 반환 → 위치 미저장.
 * - 켰더라도 좌표가 아니라 일반화된 코드만 반환.
 */
export async function resolveRegionForStorage(params: {
  locationStorageEnabled: boolean;
  rawCoord?: RawCoordinate;
  geocoder: Geocoder;
}): Promise<ObservedRegion | null> {
  if (!params.locationStorageEnabled) return null; // 프라이버시 기본값
  if (!params.rawCoord) return null;
  return params.geocoder.toRegion(params.rawCoord);
  // 주의: 이 함수를 벗어나는 순간 rawCoord 는 어디에도 저장되지 않는다.
}
