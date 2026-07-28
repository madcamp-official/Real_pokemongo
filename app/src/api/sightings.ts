import { apiClient } from '@/api/client';
import type { SightingUploadResponse } from '@/types/api';
import type { Coord } from '@/services/location';

export interface UploadFrame {
  uri: string;
  name: string;
}

export interface UploadSightingParams {
  frames: UploadFrame[];
  /** 위치 첨부를 켠 경우에만 좌표가 들어온다 (optional metadata). */
  coord?: Coord | null;
}

/**
 * F2 촬영 업로드.
 * multipart/form-data 로 원본/버스트 프레임을 전송하고 sighting_id 를 받는다.
 * 백엔드는 이 업로드에 F3(보정)/F4(동정) 파이프라인을 연쇄 트리거한다.
 */
export async function uploadSighting(
  { frames, coord }: UploadSightingParams
): Promise<SightingUploadResponse> {
  const form = new FormData();

  frames.forEach((frame) => {
    // React Native FormData 파일 파트 형식
    form.append('frames', {
      uri: frame.uri,
      name: frame.name,
      type: 'image/jpeg',
    } as unknown as Blob);
  });

  if (coord) {
    form.append('lat', String(coord.lat));
    form.append('lng', String(coord.lng));
  }

  const { data } = await apiClient.post<SightingUploadResponse>(
    '/sightings/upload',
    form
  );
  return data;
}
