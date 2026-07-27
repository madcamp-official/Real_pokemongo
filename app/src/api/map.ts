import { apiClient } from '@/api/client';
import type { MapPin, ExploredRegionsResponse } from '@/types/api';

/**
 * F11 지도 & 탐험 기록 API.
 * 지도 렌더링은 ExploreMapCanvas(일러스트 캔버스)가 맡는다 — 외부 지도 SDK를 쓰지
 * 않으므로 여기서는 핀·탐험 구역 데이터만 가져온다.
 */

export async function fetchMapPins(): Promise<MapPin[]> {
  const { data } = await apiClient.get<MapPin[]>('/map/pins');
  return data;
}

export async function fetchExploredRegions(): Promise<ExploredRegionsResponse> {
  const { data } = await apiClient.get<ExploredRegionsResponse>('/map/explored-regions');
  return data;
}
