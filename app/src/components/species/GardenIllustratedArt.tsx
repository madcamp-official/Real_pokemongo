import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

interface Props {
  speciesId: string;
  size: number;
}

type IllustratedSpecies = 'mallard' | 'sparrow' | 'hornet' | 'ladybug';

const ILLUSTRATED_SPECIES: Record<string, IllustratedSpecies> = {
  'anas-platyrhynchos': 'mallard',
  'passer-montanus': 'sparrow',
  'vespa-mandarinia': 'hornet',
  ladybug: 'ladybug',
  'coccinella-septempunctata': 'ladybug',
};

function normalizeId(speciesId: string): string {
  return speciesId.replace(/^(taxon-|sp_)/, '').replace(/_/g, '-');
}

export function hasGardenIllustratedArt(speciesId: string): boolean {
  return normalizeId(speciesId) in ILLUSTRATED_SPECIES;
}

/**
 * 정원 배경과 맞춘 작은 고슈풍 벡터 스프라이트.
 *
 * 실사 PNG를 작은 크기로 줄이면 털·광택·사진 조명이 먼저 보여 배경에서 튀므로,
 * 자주 등장하는 대표 종은 식별 특징만 남긴 부드러운 면과 짧은 붓결로 표현한다.
 * 모든 그림은 투명 배경이며 인공 발밑 그림자를 포함하지 않는다.
 */
export function GardenIllustratedArt({ speciesId, size }: Props) {
  const kind = ILLUSTRATED_SPECIES[normalizeId(speciesId)];
  if (kind === 'mallard') return <Mallard size={size} />;
  if (kind === 'sparrow') return <Sparrow size={size} />;
  if (kind === 'hornet') return <Hornet size={size} />;
  return <Ladybug size={size} />;
}

function Mallard({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 100">
      <G>
        <Ellipse cx="68" cy="65" rx="38" ry="22" fill="#C8A775" />
        <Path d="M43 57 C51 43 75 40 102 58 C91 60 83 69 75 79 C59 80 45 72 43 57 Z" fill="#A98155" />
        <Path d="M54 59 C68 50 86 53 99 59 C85 61 78 68 72 75 C63 74 57 69 54 59 Z" fill="#D8BE8F" />
        <Path d="M94 61 L113 67 L94 73 Z" fill="#4B554D" />
        <Ellipse cx="37" cy="39" rx="20" ry="22" fill="#2F795B" />
        <Path d="M24 31 C31 22 45 22 52 31 C45 28 36 29 24 31 Z" fill="#4A9A72" opacity="0.8" />
        <RectLikeNeck />
        <Ellipse cx="35" cy="37" rx="3.2" ry="3.8" fill="#2F2922" />
        <Circle cx="34" cy="36" r="1.1" fill="#FFF8DD" />
        <Path d="M19 39 C11 39 4 43 2 47 C10 51 21 50 27 45 Z" fill="#E6A735" />
        <Path d="M2 47 C10 48 18 47 24 44" stroke="#9A6728" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <Path d="M59 59 C70 55 83 57 91 63" stroke="#E7D1A5" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.75" />
        <Path d="M54 83 L52 93 M67 84 L68 94" stroke="#D88335" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <Path d="M46 94 L55 94 M63 95 L73 95" stroke="#D88335" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

function RectLikeNeck() {
  return (
    <>
      <Path d="M30 53 C31 48 31 45 30 42 L48 42 C47 47 48 51 52 55 Z" fill="#7D4937" />
      <Path d="M29 45 C34 47 43 47 48 44" stroke="#F4EDCF" strokeWidth="4.2" fill="none" strokeLinecap="round" />
    </>
  );
}

function Sparrow({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 110 100">
      <G>
        <Path d="M42 76 C31 74 23 66 23 54 C23 39 36 29 53 29 C74 29 91 44 94 64 C83 77 57 82 42 76 Z" fill="#C79A5E" />
        <Ellipse cx="45" cy="42" rx="22" ry="21" fill="#B96F3E" />
        <Path d="M26 40 C33 31 49 27 61 34 C51 35 39 39 26 40 Z" fill="#D58B4D" opacity="0.75" />
        <Path d="M29 43 C35 38 43 37 51 40 C48 49 42 54 32 54 Z" fill="#F3E5C3" />
        <Ellipse cx="37" cy="46" rx="5.5" ry="6.2" fill="#5A4332" />
        <Path d="M53 46 C68 37 83 44 91 58 C79 57 68 63 55 69 C49 63 49 53 53 46 Z" fill="#8C623E" />
        <Path d="M58 48 L82 57 M57 55 L79 64" stroke="#D8B277" strokeWidth="3.1" fill="none" strokeLinecap="round" />
        <Path d="M87 62 L107 72 L86 75 Z" fill="#71513A" />
        <Circle cx="40" cy="38" r="3.1" fill="#29251F" />
        <Circle cx="39.3" cy="37.3" r="1" fill="#FFF6DD" />
        <Path d="M24 43 L8 48 L24 52 Z" fill="#80623F" />
        <Path d="M47 77 L44 90 M62 78 L63 91" stroke="#B7774A" strokeWidth="2.7" fill="none" strokeLinecap="round" />
        <Path d="M39 91 L48 91 M58 92 L68 92" stroke="#B7774A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

function Hornet({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 100">
      <G>
        <Path d="M50 47 C59 18 87 10 111 17 C96 35 76 47 54 54 Z" fill="#E7D7B9" opacity="0.72" />
        <Path d="M52 52 C72 35 98 37 115 47 C93 58 73 61 53 59 Z" fill="#F0CDBA" opacity="0.66" />
        <Ellipse cx="67" cy="60" rx="31" ry="17" fill="#D8872B" transform="rotate(8 67 60)" />
        <Path d="M51 46 C67 39 83 43 92 53 C84 59 75 63 62 64 C52 60 48 53 51 46 Z" fill="#3F3B31" />
        <Path d="M72 46 C78 49 82 54 84 62 M88 51 C93 56 95 63 94 69" stroke="#3A382F" strokeWidth="7" fill="none" />
        <Ellipse cx="33" cy="57" rx="18" ry="16" fill="#E39A36" transform="rotate(-8 33 57)" />
        <Ellipse cx="27" cy="55" rx="5" ry="7" fill="#514438" />
        <Circle cx="23" cy="52" r="1.5" fill="#FFF3D0" />
        <Path d="M18 45 C10 36 4 35 2 39 M21 43 C17 31 12 27 8 28" stroke="#5D4A36" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <Path d="M45 66 L30 84 M57 70 L50 92 M76 72 L82 92" stroke="#5D4934" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <Path d="M43 51 L29 35 M57 47 L49 29" stroke="#5D4934" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Path d="M98 63 L116 69 L101 74 Z" fill="#493D31" />
      </G>
    </Svg>
  );
}

function Ladybug({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G>
        <Path d="M18 58 C18 34 33 19 52 19 C73 19 88 37 86 61 C84 80 68 89 49 88 C29 87 17 76 18 58 Z" fill="#D9563F" />
        <Path d="M49 21 C42 22 34 27 29 34 C36 38 43 40 50 40 C58 40 65 38 72 34 C67 27 59 22 49 21 Z" fill="#3E4036" />
        <Path d="M50 39 L50 86" stroke="#493B32" strokeWidth="2.4" strokeLinecap="round" />
        <Circle cx="35" cy="51" r="5.2" fill="#403B32" />
        <Circle cx="67" cy="50" r="5.4" fill="#403B32" />
        <Circle cx="34" cy="69" r="4.7" fill="#403B32" />
        <Circle cx="67" cy="70" r="4.9" fill="#403B32" />
        <Circle cx="50" cy="26" r="12" fill="#393A32" />
        <Path d="M33 40 C25 46 23 59 26 67" stroke="#EA7660" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.75" />
        <Path d="M30 48 L15 39 M29 59 L12 59 M33 73 L18 83 M69 47 L84 38 M72 59 L90 59 M68 74 L83 84" stroke="#4E4336" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Path d="M43 17 C39 10 35 8 32 7 M57 17 C61 10 65 8 68 7" stroke="#4E4336" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </G>
    </Svg>
  );
}
