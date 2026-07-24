import { apiClient } from '@/api/client';
import type {
  GardenLayout,
  TileCompatibility,
  CreatureStatus,
} from '@/types/api';

/** F16 홈 가든 API. */

export async function fetchGardenLayout(): Promise<GardenLayout> {
  const { data } = await apiClient.get<GardenLayout>('/garden/layout');
  return data;
}

/** 배치 데이터는 로컬 우선 저장 후 이 API 로 서버에 동기화한다. */
export async function saveGardenLayout(layout: GardenLayout): Promise<void> {
  await apiClient.put('/garden/layout', layout);
}

export async function fetchTileCompatibility(): Promise<TileCompatibility> {
  const { data } = await apiClient.get<TileCompatibility>('/garden/tile-compatibility');
  return data;
}

export async function fetchCreatureStatus(creatureId: string): Promise<CreatureStatus> {
  const { data } = await apiClient.get<CreatureStatus>(`/creatures/${creatureId}/status`);
  return data;
}

/** 작명 (F16). */
export async function nameCreature(creatureId: string, nickname: string): Promise<void> {
  await apiClient.post(`/creatures/${creatureId}/name`, { nickname });
}
