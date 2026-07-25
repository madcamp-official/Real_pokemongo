import { apiClient } from '@/api/client';
import type { Quest, XPProfile } from '@/types/api';

/** F10 퀘스트 API. */

export async function fetchActiveQuests(): Promise<Quest[]> {
  const { data } = await apiClient.get<Quest[]>('/quests', {
    params: { active: true },
  });
  return data;
}

/** 완료(completed) 상태 퀘스트의 보상을 수령한다. */
export async function claimQuest(questId: string): Promise<XPProfile> {
  const { data } = await apiClient.post<XPProfile>(`/quests/${questId}/claim`);
  return data;
}
