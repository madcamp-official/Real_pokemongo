import { apiClient } from '@/api/client';
import type {
  ProfessorAskResponse,
  ProfessorGreeting,
  ProfessorSuggestion,
} from '@/types/api';

export async function askProfessor(
  question: string,
  contextSpeciesId?: string
): Promise<ProfessorAskResponse> {
  const { data } = await apiClient.post<ProfessorAskResponse>('/professor/ask', {
    question,
    context_species_id: contextSpeciesId ?? null,
  });
  return data;
}

export async function fetchProfessorSuggestions(): Promise<ProfessorSuggestion[]> {
  const { data } = await apiClient.get<ProfessorSuggestion[]>('/professor/suggestions');
  return data;
}

export async function fetchProfessorGreeting(): Promise<ProfessorGreeting> {
  const { data } = await apiClient.get<ProfessorGreeting>('/professor/greeting');
  return data;
}

