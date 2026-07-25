import { apiClient } from '@/api/client';
import type { PreviewScanRequest, PreviewScanResponse } from '@/types/api';

/**
 * F19 터치 기반 사전 위험 경고.
 * 프리뷰에서 터치한 지점을 크롭한 저해상도 이미지를 보내 잠정 추정 결과를 받는다.
 * F4(정밀 동정)와는 별개의 경량 경로 — 결과는 잠정치.
 */
export async function previewScan(
  req: PreviewScanRequest
): Promise<PreviewScanResponse> {
  const { data } = await apiClient.post<PreviewScanResponse>(
    '/vision/preview-scan',
    req
  );
  return data;
}
