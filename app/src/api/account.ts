import { apiClient } from '@/api/client';
import type { RestoreBundleResponse } from '@/types/api';

/** F18 설정 & 계정 관리 API. */

/** 기기 변경/재설치 후 도감·홈가든 배치 등 계정 데이터를 서버에서 복원한다. */
export async function fetchRestoreBundle(): Promise<RestoreBundleResponse> {
  const { data } = await apiClient.get<RestoreBundleResponse>('/account/restore-bundle');
  return data;
}

/** 계정 삭제(파기 워크플로우 트리거). */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/account');
}
