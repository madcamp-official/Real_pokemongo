import { Image, type ImageSourcePropType } from 'react-native';
import { GardenCreatureArt, getGardenCreatureImageSource } from '@/components/species/GardenCreatureArt';
import { UnknownSpeciesSilhouette } from '@/components/dex/UnknownSpeciesSilhouette';
import type { TaxonGroup } from '@/types/api';

interface Props {
  speciesId: string;
  group: TaxonGroup;
  size?: number;
  silhouette?: boolean;
}

/**
 * 도감 전용 종 이미지.
 *
 * 발견 여부와 관계없이 assets/species의 같은 PNG를 사용한다. 미발견 상태에서는
 * PNG의 투명도(윤곽)는 유지하고 색만 회색으로 바꿔, 이름과 색상은 숨기면서도
 * 종마다 서로 다른 실루엣이 보이게 한다.
 */
export function DexSpeciesArt({ speciesId, group, size = 58, silhouette = false }: Props) {
  const source = getGardenCreatureImageSource(speciesId);

  if (source) {
    return (
      <Image
        source={source}
        resizeMode="contain"
        style={{
          width: size,
          height: size,
          tintColor: silhouette ? '#AAA8AA' : undefined,
          opacity: silhouette ? 0.86 : 1,
        }}
        accessibilityLabel={silhouette ? '미수집 종 실루엣' : undefined}
        accessibilityIgnoresInvertColors
      />
    );
  }

  // 신규 종이 서버에 먼저 추가돼 PNG가 아직 없는 경우에도 화면이 깨지지 않게 한다.
  if (silhouette) return <UnknownSpeciesSilhouette group={group} size={size} />;
  return <GardenCreatureArt speciesId={speciesId} size={size} />;
}
