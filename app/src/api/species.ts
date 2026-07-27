import { apiClient } from '@/api/client';
import { env } from '@/config/env';
import type { SpeciesCard, SpeciesPhoto } from '@/types/api';

/** F6 종 카드 콘텐츠 조회. */
export async function fetchSpeciesCard(speciesId: string): Promise<SpeciesCard> {
  const { data } = await apiClient.get<SpeciesCard>(`/species/${speciesId}/card`);
  return data;
}

/** F6 "지금까지 찍은 사진" 갤러리 — 최신 촬영이 먼저 온다(서버 정렬 그대로). */
export async function fetchSpeciesPhotos(speciesId: string): Promise<SpeciesPhoto[]> {
  const { data } = await apiClient.get<{ photos: SpeciesPhoto[] }>(`/species/${speciesId}/photos`);
  return data.photos;
}

/**
 * 사진 응답의 `url`은 서버 상대 경로(`/media/:id`)라 base URL을 직접 붙여야 한다 —
 * apiClient(axios)와 달리 <Image>는 baseURL 설정을 타지 않는다.
 */
export function toMediaUrl(relativeUrl: string): string {
  return `${env.API_BASE_URL}${relativeUrl}`;
}
