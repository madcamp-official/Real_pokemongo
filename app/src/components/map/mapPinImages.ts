import { Asset } from 'expo-asset';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { getGardenCreatureImageSource } from '@/components/species/GardenCreatureArt';

const PIN_IMAGE_WIDTH = 72;
const dataUriCache = new Map<string, Promise<string>>();

/**
 * 앱 번들의 종 PNG를 지도 WebView용 작은 data URI로 변환한다.
 *
 * WebView 문서는 카카오 도메인 등록을 위해 https origin을 사용하므로 개발 서버의
 * http URI나 배포 앱의 file URI를 img src로 직접 읽지 못하는 기기가 있다. PNG를
 * 한 번만 72px로 축소해 data URI로 전달하면 origin·파일 권한과 무관하게 동작하며,
 * 캐시 덕분에 같은 종을 여러 번 관찰해도 변환은 한 번만 수행한다.
 */
export function getMapPinImageDataUri(speciesId: string): Promise<string> {
  const cached = dataUriCache.get(speciesId);
  if (cached) return cached;

  const pending = createMapPinImageDataUri(speciesId).catch(() => {
    // 일시적인 asset 다운로드 실패는 다음 지도 갱신 때 다시 시도할 수 있게 한다.
    dataUriCache.delete(speciesId);
    return '';
  });
  dataUriCache.set(speciesId, pending);
  return pending;
}

async function createMapPinImageDataUri(speciesId: string): Promise<string> {
  const source = getGardenCreatureImageSource(speciesId);
  if (!source) return '';

  // 이 레지스트리의 source는 모두 정적 require() 결과다.
  const asset = Asset.fromModule(source as number);
  await asset.downloadAsync();
  const localUri = asset.localUri ?? asset.uri;
  if (!localUri) return '';

  const thumbnail = await manipulateAsync(
    localUri,
    [{ resize: { width: PIN_IMAGE_WIDTH } }],
    { format: SaveFormat.PNG, base64: true },
  );
  return thumbnail.base64 ? `data:image/png;base64,${thumbnail.base64}` : '';
}
