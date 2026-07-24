import { apiClient } from '@/api/client';
import type { IdentifyResponse } from '@/types/api';

/**
 * F4 AI 동정.
 * 업로드된 sighting 에 대한 동정 결과(상위 후보 + 신뢰도 + 위험 여부)를 받는다.
 */
export async function identifySighting(sightingId: string): Promise<IdentifyResponse> {
  const { data } = await apiClient.post<IdentifyResponse>('/identify', {
    sighting_id: sightingId,
  });
  return data;
}

/** 사용자가 후보 중 하나를 선택해 동정을 확정한다 → 도감(F5) 자동 등록. */
export async function confirmIdentify(
  sightingId: string,
  speciesId: string
): Promise<void> {
  await apiClient.post('/identify/confirm', {
    sighting_id: sightingId,
    species_id: speciesId,
  });
}
