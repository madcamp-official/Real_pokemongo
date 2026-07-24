import * as ImagePicker from 'expo-image-picker';

export interface PickedPhoto {
  uri: string;
  /** EXIF 에 위치정보가 있는지 — 지도 기록 반영 여부 1차 필터링에 사용 (F2) */
  hasLocation: boolean;
}

/**
 * 갤러리에서 사진 불러오기 (F2).
 * EXIF 메타데이터 유무를 판별해 "지도 기록 반영 여부"를 클라이언트에서 1차 필터링한다.
 *
 * ⚠️ 참고(보안): 스마트폰 사진 EXIF 에는 촬영 위치 GPS 가 박혀 있을 수 있다.
 * 실제 서버 전송 파이프라인에서는 EXIF(특히 GPS) 제거 정책을 백엔드와 합의해야 한다.
 * 여기서는 위치 '유무'만 판별하고 좌표 원본을 그대로 전달하지 않는다.
 */
export async function pickFromGallery(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    exif: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const exif = asset.exif ?? {};
  const hasLocation =
    exif.GPSLatitude != null ||
    exif.GPSLongitude != null ||
    exif.GPS != null;

  return { uri: asset.uri, hasLocation };
}
