import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import { useAuthStore } from '@/store/authStore';
import { attachMockAdapter } from '@/mocks/mockAdapter';

/**
 * 공용 axios 인스턴스.
 * - 요청 인터셉터: 인증 토큰 자동 주입
 * - USE_MOCK=true 이면 mock 어댑터를 붙여 로컬 응답을 반환
 */
export const apiClient = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: env.REQUEST_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Phase 2에서 토큰 갱신/로그아웃 처리 연결 예정
      useAuthStore.getState().clearSession();
    }
    return Promise.reject(error);
  }
);

if (env.USE_MOCK) {
  attachMockAdapter(apiClient);
}
