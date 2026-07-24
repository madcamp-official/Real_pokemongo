import { apiClient } from '@/api/client';
import type { SpeciesCard } from '@/types/api';

/** F6 종 카드 콘텐츠 조회. */
export async function fetchSpeciesCard(speciesId: string): Promise<SpeciesCard> {
  const { data } = await apiClient.get<SpeciesCard>(`/species/${speciesId}/card`);
  return data;
}
