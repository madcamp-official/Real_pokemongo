import { apiClient } from '@/api/client';
import type { RestoreBundleResponse } from '@/types/api';

/** F18 설정 & 계정 관리 API. */

export interface PrivacySettings {
  location: boolean;
  photo: boolean;
}

/**
 * 기기 변경/재설치 후 계정 데이터를 서버에서 복원한다.
 * 응답의 `garden_layout_present`는 서버(3D 홈가든 등 다른 클라이언트)가 정원 배치를
 * 갖고 있는지 여부일 뿐, 이 모바일 앱은 홈가든 UI가 없어 값을 읽지 않는다.
 */
export async function fetchRestoreBundle(): Promise<RestoreBundleResponse> {
  const { data } = await apiClient.get<RestoreBundleResponse>('/account/restore-bundle');
  return data;
}

/** 설정 화면의 위치/사진 수집 토글이 실제로 반영된 서버 측 현재 값. */
export async function fetchPrivacySettings(): Promise<PrivacySettings> {
  const { data } = await apiClient.get<PrivacySettings>('/account/privacy-settings');
  return data;
}

/** 위치/사진 수집 토글 변경 — 지도(F11)의 위치 저장, 재학습 샘플 수집 여부에 실제로 반영된다. */
export async function updatePrivacySettings(settings: PrivacySettings): Promise<PrivacySettings> {
  const { data } = await apiClient.patch<PrivacySettings>('/account/privacy-settings', settings);
  return data;
}

/** 계정 삭제(파기 워크플로우 트리거). */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/account');
}
