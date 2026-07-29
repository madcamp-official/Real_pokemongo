import { apiClient } from '@/api/client';
import type {
  AudioConfirmResponse,
  AudioIdentifyResponse,
  AudioSimilarityResponse,
  AudioSightingUploadResponse,
  ID,
  SpeciesSoundsResponse,
} from '@/types/api';
import type { Coord } from '@/services/location';

export interface UploadAudioSightingParams {
  uri: string;
  clientRecordingId: string;
  durationMs: number;
  recordedAt: string;
  coord?: Coord | null;
}

function audioFilePart(uri: string, clientRecordingId: string): Blob {
  const cleanUri = uri.split('?')[0] ?? uri;
  const extension = cleanUri.split('.').pop()?.toLowerCase() ?? 'm4a';
  const type = extension === 'webm' ? 'audio/webm' : extension === 'wav' ? 'audio/wav' : 'audio/mp4';
  return {
    uri,
    name: `${clientRecordingId}.${extension}`,
    type,
  } as unknown as Blob;
}

/** 소리 녹음 업로드와 서버 품질 검사를 한 번에 요청한다. */
export async function uploadAudioSighting(
  params: UploadAudioSightingParams,
): Promise<AudioSightingUploadResponse> {
  const form = new FormData();
  form.append('audio', audioFilePart(params.uri, params.clientRecordingId));
  form.append('client_recording_id', params.clientRecordingId);
  form.append('duration_ms', String(Math.round(params.durationMs)));
  form.append('recorded_at', params.recordedAt);
  form.append('mode', 'ambient');
  if (params.coord) {
    form.append('lat', String(params.coord.lat));
    form.append('lng', String(params.coord.lng));
  }
  const { data } = await apiClient.post<AudioSightingUploadResponse>(
    '/audio/sightings/upload',
    form,
    {
      // 422는 전송 실패가 아니라 서버 품질 검사 결과다. 본문에 usable=false와
      // feedback_codes가 들어 있으므로 예외로 버리지 말고 화면이 재녹음 사유를
      // 정확히 안내하게 한다(API_CONTRACT.md §1).
      validateStatus: (status) => (status >= 200 && status < 300) || status === 422,
    },
  );
  return data;
}

export async function identifyAudioSighting(audioSightingId: ID): Promise<AudioIdentifyResponse> {
  const { data } = await apiClient.post<AudioIdentifyResponse>('/audio/identify', {
    audio_sighting_id: audioSightingId,
  });
  return data;
}

export async function confirmAudioIdentification(
  audioSightingId: ID,
  speciesId: ID,
  confirmationId: string,
): Promise<AudioConfirmResponse> {
  const { data } = await apiClient.post<AudioConfirmResponse>('/audio/identify/confirm', {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    confirmation_id: confirmationId,
  });
  return data;
}

export async function scoreAudioSimilarity(
  audioSightingId: ID,
  speciesId: ID,
): Promise<AudioSimilarityResponse> {
  const { data } = await apiClient.post<AudioSimilarityResponse>('/audio/similarity/score', {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    mode: 'ambient',
  });
  return data;
}

export async function getSpeciesSounds(speciesId: ID): Promise<SpeciesSoundsResponse> {
  const { data } = await apiClient.get<SpeciesSoundsResponse>(`/species/${speciesId}/sounds`);
  return data;
}

export async function deleteAudioSighting(audioSightingId: ID): Promise<void> {
  await apiClient.delete(`/audio/sightings/${audioSightingId}`);
}
