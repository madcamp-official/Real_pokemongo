import { apiClient } from '@/api/client';
import type { SignupRequest, SignupResponse, ConsentRequest } from '@/types/api';

/** F1 온보딩 & 인증 API (단일 사용자 계정 모델). */

export async function signup(req: SignupRequest): Promise<SignupResponse> {
  const { data } = await apiClient.post<SignupResponse>('/auth/signup', req);
  return data;
}

export async function submitConsent(req: ConsentRequest): Promise<void> {
  await apiClient.post('/auth/consent', req);
}

export interface GuestConvertResponse {
  migrated_sightings: number;
}

/** 게스트 세션 → 정식 계정 전환 시 로컬 임시 데이터를 서버로 마이그레이션한다. */
export async function convertGuestSession(): Promise<GuestConvertResponse> {
  const { data } = await apiClient.post<GuestConvertResponse>(
    '/session/guest/convert'
  );
  return data;
}
