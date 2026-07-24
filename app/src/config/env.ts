/**
 * 환경 설정.
 * 백엔드 API 스키마가 미확정이므로 기본은 mock 모드로 동작한다.
 * 실제 서버 연동 시 USE_MOCK=false 로 바꾸고 API_BASE_URL 을 지정한다.
 */
export const env = {
  /** 실제 백엔드 대신 로컬 mock 응답을 사용할지 여부 */
  USE_MOCK: true,
  /** 백엔드 API base URL (USE_MOCK=false 일 때 사용) */
  API_BASE_URL: 'http://localhost:8080',
  /** 네트워크 요청 타임아웃 (ms) — 리스크 1(네트워크 불안정) 대응 */
  REQUEST_TIMEOUT: 15000,
} as const;
