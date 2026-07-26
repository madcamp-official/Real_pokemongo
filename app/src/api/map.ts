import { apiClient } from '@/api/client';
import { env } from '@/config/env';
import type { MapPin, ExploredRegionsResponse } from '@/types/api';

/** F11 지도 & 탐험 기록 API. */

/** WebView가 로드할 카카오맵 페이지 주소. */
export const MAP_HTML_URL = `${env.API_BASE_URL}/map.html`;

export async function fetchMapPins(): Promise<MapPin[]> {
  const { data } = await apiClient.get<MapPin[]>('/map/pins');
  return data;
}

export async function fetchExploredRegions(): Promise<ExploredRegionsResponse> {
  const { data } = await apiClient.get<ExploredRegionsResponse>('/map/explored-regions');
  return data;
}
