import { apiClient } from '@/api/client';
import type {
  MapPin,
  ExploredRegionsResponse,
  WeeklyExploreStats,
} from '@/types/api';

/** F11 지도 & 탐험 기록 API. */

export async function fetchMapPins(): Promise<MapPin[]> {
  const { data } = await apiClient.get<MapPin[]>('/map/pins');
  return data;
}

export async function fetchExploredRegions(): Promise<ExploredRegionsResponse> {
  const { data } = await apiClient.get<ExploredRegionsResponse>('/map/explored-regions');
  return data;
}

export async function fetchWeeklyStats(): Promise<WeeklyExploreStats> {
  const { data } = await apiClient.get<WeeklyExploreStats>('/map/weekly-stats');
  return data;
}
