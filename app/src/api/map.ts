import { apiClient } from '@/api/client';
import { env } from '@/config/env';
import type { MapPin, ExploredRegionsResponse } from '@/types/api';

/** F11 지도 & 탐험 기록 API. */

/** 백엔드가 서빙하는 카카오맵 페이지 주소(인증 불필요). */
export const MAP_HTML_URL = `${env.API_BASE_URL}/map.html`;

/**
 * 카카오 개발자 콘솔에 "Web 플랫폼 사이트 도메인"으로 등록된 origin.
 *
 * 카카오 지도 SDK 는 요청의 Referer 를 보고 등록된 도메인이 아니면 401 로 거부한다
 * ("domain mismatched!"). 실기기는 백엔드를 LAN IP(예: http://10.249.49.23:8080)로
 * 접근하는데 그 주소는 콘솔에 등록돼 있지 않고, IP 는 네트워크마다 바뀌어서 매번
 * 등록하는 것도 현실적이지 않다.
 *
 * 그래서 페이지를 URL 로 열지 않고 HTML 을 받아와 이 baseUrl 로 렌더한다 —
 * WebView 문서의 origin 이 이 값이 되어 SDK 요청의 Referer 도 이 값으로 나간다.
 * 콘솔에 등록된 도메인을 바꾸면 이 상수도 같이 바꿔야 한다.
 */
export const KAKAO_ALLOWED_ORIGIN = 'http://localhost:8080';

/** 지도 페이지 HTML 을 문자열로 받아온다(WebView 에 baseUrl 과 함께 주입하기 위함). */
export async function fetchMapHtml(): Promise<string> {
  const res = await fetch(MAP_HTML_URL);
  if (!res.ok) throw new Error(`map.html ${res.status}`);
  return res.text();
}

export async function fetchMapPins(): Promise<MapPin[]> {
  const { data } = await apiClient.get<MapPin[]>('/map/pins');
  return data;
}

export async function fetchExploredRegions(): Promise<ExploredRegionsResponse> {
  const { data } = await apiClient.get<ExploredRegionsResponse>('/map/explored-regions');
  return data;
}
