import { Asset } from 'expo-asset';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const EXPLORER_IMAGE_WIDTH = 128;
let dataUriPromise: Promise<string> | null = null;

/**
 * 현재 위치 탐험가 PNG를 지도 WebView가 안전하게 읽을 수 있는 data URI로 변환한다.
 * GPS 좌표 메시지마다 이미지를 다시 보내지 않도록 앱 실행 중 한 번만 생성·캐시한다.
 */
export function getMapExplorerImageDataUri(): Promise<string> {
  if (dataUriPromise) return dataUriPromise;

  dataUriPromise = createMapExplorerImageDataUri().catch(() => {
    dataUriPromise = null;
    return '';
  });
  return dataUriPromise;
}

async function createMapExplorerImageDataUri(): Promise<string> {
  const asset = Asset.fromModule(require('../../../assets/map/little-explorer.png'));
  await asset.downloadAsync();
  const localUri = asset.localUri ?? asset.uri;
  if (!localUri) return '';

  const image = await manipulateAsync(
    localUri,
    [{ resize: { width: EXPLORER_IMAGE_WIDTH } }],
    { format: SaveFormat.PNG, base64: true },
  );
  return image.base64 ? `data:image/png;base64,${image.base64}` : '';
}
