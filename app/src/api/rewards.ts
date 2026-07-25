import { apiClient } from '@/api/client';
import type { XPProfile, Badge } from '@/types/api';

/** F8 배지 · 레벨 보상 API. */

export async function fetchXpProfile(): Promise<XPProfile> {
  const { data } = await apiClient.get<XPProfile>('/profile/xp');
  return data;
}

export async function fetchBadges(): Promise<Badge[]> {
  const { data } = await apiClient.get<Badge[]>('/badges');
  return data;
}

/** 해금된(unlocked) 배지를 수령해 XP를 지급받는다. */
export async function claimBadge(badgeId: string): Promise<XPProfile> {
  const { data } = await apiClient.post<XPProfile>('/badges/claim', {
    badge_id: badgeId,
  });
  return data;
}
