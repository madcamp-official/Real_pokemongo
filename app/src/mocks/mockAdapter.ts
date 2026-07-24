import type { AxiosInstance, AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import {
  mockDex,
  mockDexCompletion,
  getMockSpeciesCard,
  mockIdentify,
  mockPreviewScan,
  buildMockSignup,
  mockGuestConvert,
  mockRestoreBundle,
  mockGardenLayout,
  mockTileCompatibility,
  buildMockCreatureStatus,
} from '@/mocks/mockData';

function speciesIdFromUrl(url: string): string {
  const m = url.match(/\/species\/([^/]+)\/card/);
  return m ? m[1] : 'sp_ladybug';
}

function creatureIdFromUrl(url: string): string {
  const m = url.match(/\/creatures\/([^/]+)\//);
  return m ? m[1] : 'cr_1';
}

/**
 * 간이 mock 어댑터.
 * USE_MOCK=true 일 때 apiClient 에 부착되어, 실제 네트워크 대신
 * URL 패턴에 매칭되는 canned 응답을 지연(latency) 후 반환한다.
 *
 * 각 Phase 진입 시 이 매핑 테이블에 엔드포인트를 추가하며 확장한다.
 */

type Handler = (config: InternalAxiosRequestConfig) => unknown;

function parseBody(config: InternalAxiosRequestConfig): Record<string, unknown> {
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (config.data as Record<string, unknown>) ?? {};
}

// [메서드, URL 정규식, 응답 생성기]
const routes: Array<[string, RegExp, Handler]> = [
  ['GET', /\/dex\/completion$/, () => mockDexCompletion],
  ['GET', /\/dex/, () => mockDex],
  ['GET', /\/species\/[^/]+\/card/, (config) => getMockSpeciesCard(speciesIdFromUrl(config.url ?? ''))],
  ['POST', /\/identify\/confirm$/, () => ({})],
  ['POST', /\/identify$/, () => mockIdentify],
  ['POST', /\/vision\/preview-scan$/, () => mockPreviewScan],
  ['POST', /\/sightings\/upload$/, () => ({ sighting_id: 'sgt_mock_1', status: 'done' })],
  [
    'POST',
    /\/auth\/signup$/,
    (config) => {
      const body = parseBody(config);
      return buildMockSignup(
        (body.email as string) ?? 'guest@example.com',
        (body.nickname as string) ?? '탐험가',
        (body.avatar as string) ?? '🦊'
      );
    },
  ],
  ['POST', /\/auth\/consent$/, () => ({})],
  ['POST', /\/session\/guest\/convert$/, () => mockGuestConvert],
  ['GET', /\/account\/restore-bundle$/, () => mockRestoreBundle],
  ['DELETE', /\/account$/, () => ({})],
  // F16 홈 가든
  ['GET', /\/garden\/layout$/, () => mockGardenLayout],
  ['PUT', /\/garden\/layout$/, () => ({})],
  ['GET', /\/garden\/tile-compatibility$/, () => mockTileCompatibility],
  ['POST', /\/creatures\/[^/]+\/name$/, () => ({})],
  [
    'GET',
    /\/creatures\/[^/]+\/status$/,
    (config) => buildMockCreatureStatus(creatureIdFromUrl(config.url ?? ''), null),
  ],
];

const LATENCY_MS = 400;

export function attachMockAdapter(client: AxiosInstance): void {
  const mockAdapter: AxiosAdapter = (config) =>
    new Promise<AxiosResponse>((resolve, reject) => {
      const method = (config.method ?? 'get').toUpperCase();
      const url = config.url ?? '';
      const match = routes.find(([m, re]) => m === method && re.test(url));

      setTimeout(() => {
        if (!match) {
          reject(new Error(`[mock] 미정의 라우트: ${method} ${url}`));
          return;
        }
        const data = match[2](config);
        resolve({
          data,
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        } as AxiosResponse);
      }, LATENCY_MS);
    });

  client.defaults.adapter = mockAdapter;
}
