/**
 * 골든 테스트: 위치 프라이버시 불변식 (체크리스트 §4.2 — CI 게이트).
 *
 * 회귀하면 아동의 정밀 위치가 저장/유출될 수 있다(법 위반). 절대 약화 금지.
 * 핵심 불변식:
 *  - 위치 저장 OFF(기본) → 좌표를 줘도 결과는 null.
 *  - 위치 저장 ON → 시·군·구 수준 코드만, 원본 정밀 좌표는 결과에 존재하지 않음.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StubGridGeocoder,
  resolveRegionForStorage,
} from "./regionGeneralizer.js";

const geocoder = new StubGridGeocoder();

test("위치 저장 OFF(기본)면 좌표를 줘도 region은 null", async () => {
  const region = await resolveRegionForStorage({
    locationStorageEnabled: false,
    rawCoord: { lat: 37.512345, lng: 127.056789 },
    geocoder,
  });
  assert.equal(region, null);
});

test("좌표가 없으면 저장을 켰어도 null", async () => {
  const region = await resolveRegionForStorage({
    locationStorageEnabled: true,
    rawCoord: undefined,
    geocoder,
  });
  assert.equal(region, null);
});

test("위치 저장 ON이면 시·군·구 수준 코드만 반환하고, 정밀 좌표는 결과에 없다", async () => {
  const lat = 37.512345;
  const lng = 127.056789;
  const region = await resolveRegionForStorage({
    locationStorageEnabled: true,
    rawCoord: { lat, lng },
    geocoder,
  });
  assert.ok(region, "저장 ON이면 region이 있어야 함");

  // 결과 객체에 lat/lng 필드 자체가 없어야 한다.
  const asRecord = region as unknown as Record<string, unknown>;
  assert.equal(asRecord.lat, undefined);
  assert.equal(asRecord.lng, undefined);

  // 직렬화한 문자열에 원본 정밀 좌표가 남아 있으면 안 된다.
  const serialized = JSON.stringify(region);
  assert.equal(
    serialized.includes("37.512345"),
    false,
    "정밀 위도가 저장 데이터에 남아선 안 됨",
  );
  assert.equal(
    serialized.includes("127.056789"),
    false,
    "정밀 경도가 저장 데이터에 남아선 안 됨",
  );
  assert.ok(region!.regionCode.length > 0);
});

test("StubGridGeocoder는 좌표를 저해상도로 뭉갠다(정밀도 폐기)", async () => {
  // 같은 0.1 격자 안의 서로 다른 정밀 좌표 두 개.
  const a = await geocoder.toRegion({ lat: 37.521, lng: 127.021 });
  const b = await geocoder.toRegion({ lat: 37.539, lng: 127.039 });
  // 소수점 1자리로 뭉개므로 두 좌표가 같은 격자로 수렴(정밀 좌표 구분 불가).
  assert.equal(a!.regionCode, b!.regionCode);
});
