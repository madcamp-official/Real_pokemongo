/**
 * 위치 일반화 (명세서 F12 / §8: 프라이버시 우선했던 원칙 — D단계에서 일부 수정됨).
 *
 * ⚠️ D단계 변경 사항: 이 함수(`resolveRegionForStorage`)는 여전히 `region`(일반화된
 * 시·군·구 코드)만 만들고, 여기서 만든 값 밖으로 원본 좌표가 안 나간다는 계약은 그대로다.
 * 하지만 **원본 좌표(정밀 GPS) 자체는 이제 별도 경로로 Observation.preciseCoord에 항상
 * 저장된다**(제품 결정 — 동의 플래그와 무관, ObservationFlow.recordIdentification 참고).
 * 즉 "정밀 좌표가 시스템 어디에도 안 남는다"는 옛 원칙은 더 이상 사실이 아니다 — 지금은
 * "region(일반화 값)은 여전히 이 함수를 거쳐야만 나온다"만 유지되는 좁은 계약이다.
 *
 * TODO(제공 필요): 실제 역지오코딩(좌표→시군구코드).
 *   옵션 A) 국내 행정경계 GeoJSON 을 앱 내장 → 클라이언트에서 변환(좌표가 서버에 안 옴, 최선).
 *   옵션 B) 서버측 역지오코딩 서비스(SPECIES/GEO API). 이 경우에도 region 산출용 원본 좌표는
 *           이 함수 밖으로 안 나간다(단, preciseCoord 저장 경로는 이 함수와 무관하게 별도로 존재).
 */
import type { ObservedRegion, PreciseCoordinate } from "../domain/types.js";

/** `PreciseCoordinate`의 별칭 — 이 파일의 기존 호출부 이름을 그대로 유지하기 위함. */
export type RawCoordinate = PreciseCoordinate;

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
  // 주의: 이 함수가 만드는 region(일반화 값)은 이 함수를 거쳐야만 나온다는 계약만 유지된다.
  // rawCoord 원본은(이 함수와 별개로) Observation.preciseCoord에 항상 저장된다 — 파일 상단 주석 참고.
}
