import { apiClient } from '@/api/client';
import type { SignupRequest, SignupResponse, LoginRequest, LoginResponse } from '@/types/api';

/**
 * F1 온보딩 & 인증 API (단일 사용자 계정 모델).
 * 동의(consent)는 계정 생성 전엔 인증 토큰이 없어 별도 제출이 불가능하므로,
 * SignupRequest에 담아 `signup()` 한 번에 함께 제출한다(ConsentScreen → SignupScreen).
 */

export async function signup(req: SignupRequest): Promise<SignupResponse> {
  const { data } = await apiClient.post<SignupResponse>('/auth/signup', req);
  return data;
}

/** 기존 계정으로 로그인. 이메일/비밀번호 중 어느 쪽이 틀렸는지는 서버가 구분해 알려주지 않는다. */
export async function login(req: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', req);
  return data;
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
