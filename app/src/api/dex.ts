import { apiClient } from '@/api/client';
import type { DexEntry, DexCompletion } from '@/types/api';

/**
 * F5 도감 API. (Phase 3에서 화면과 연결)
 * Phase 0에서는 mock 어댑터를 통해 동작 검증 용도로만 사용.
 */
export async function fetchDex(): Promise<DexEntry[]> {
  const { data } = await apiClient.get<DexEntry[]>('/dex');
  return data;
}

export async function fetchDexCompletion(): Promise<DexCompletion> {
  const { data } = await apiClient.get<DexCompletion>('/dex/completion');
  return data;
}
