import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/**
 * 종별 일러스트 (F5/F6/F16 공용).
 *
 * 시안의 납작한 벡터 톤(굵은 외곽 없이 면으로만, 둥근 실루엣)에 맞춰 코드로 그린다.
 * 이모지 대체가 목적이라 정확한 도감 삽화가 아니라 "한눈에 알아보는 캐릭터"를 노린다.
 * 모든 아트는 100×100 viewBox 기준으로 그려 크기 조절이 자유롭다.
 *
 * 3D(F7)로 갈 때는 이 컴포넌트의 자리만 교체하면 되도록, 호출부는 종 ID와 크기만 넘긴다.
 */

const VIEW = 100;

interface Props {
  speciesId: string;
  size?: number;
}

export function CreatureArt({ speciesId, size = 96 }: Props) {
  const Art = ART[normalizeId(speciesId)] ?? UnknownArt;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <Art />
    </Svg>
  );
}

/** 이 종의 전용 일러스트가 있는지(없으면 물음표 아트로 폴백). */
export function hasCreatureArt(speciesId: string): boolean {
  return normalizeId(speciesId) in ART;
}

/**
 * 백엔드는 `taxon-ladybug`, 초기 mock 은 `sp_ladybug` 를 쓴다.
 * 둘 다 같은 그림을 찾아가도록 접두사를 떼고 키를 맞춘다.
 */
function normalizeId(speciesId: string): string {
  return speciesId.replace(/^(taxon-|sp_)/, '').replace(/_/g, '-');
}

// ─── 무당벌레 ──────────────────────────────────────────────────────
function Ladybug() {
  return (
    <G>
      {/* 몸통 */}
      <Circle cx="50" cy="56" r="34" fill="#E5453A" />
      {/* 가운데 접힌 날개선 */}
      <Rect x="48.4" y="26" width="3.2" height="64" rx="1.6" fill="#241C1A" />
      {/* 점무늬 */}
      <Circle cx="32" cy="45" r="6.4" fill="#241C1A" />
      <Circle cx="68" cy="45" r="6.4" fill="#241C1A" />
      <Circle cx="30" cy="66" r="5.2" fill="#241C1A" />
      <Circle cx="70" cy="66" r="5.2" fill="#241C1A" />
      <Circle cx="50" cy="78" r="4.6" fill="#241C1A" />
      {/* 머리 */}
      <Circle cx="50" cy="27" r="17" fill="#241C1A" />
      <Circle cx="43" cy="24" r="4.1" fill="#FFFFFF" />
      <Circle cx="57" cy="24" r="4.1" fill="#FFFFFF" />
    </G>
  );
}

// ─── 배추흰나비 ────────────────────────────────────────────────────
function CabbageWhite() {
  return (
    <G>
      {/* 더듬이 */}
      <Path d="M50 44 C46 32 41 25 35 20" stroke="#3A3330" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <Path d="M50 44 C54 32 59 25 65 20" stroke="#3A3330" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <Circle cx="34" cy="19" r="3" fill="#3A3330" />
      <Circle cx="66" cy="19" r="3" fill="#3A3330" />
      {/* 윗날개 */}
      <Ellipse cx="27" cy="45" rx="21" ry="17" fill="#FBF7EC" transform="rotate(-18 27 45)" />
      <Ellipse cx="73" cy="45" rx="21" ry="17" fill="#FBF7EC" transform="rotate(18 73 45)" />
      {/* 아랫날개 */}
      <Ellipse cx="33" cy="70" rx="16" ry="13" fill="#F0E9DA" transform="rotate(14 33 70)" />
      <Ellipse cx="67" cy="70" rx="16" ry="13" fill="#F0E9DA" transform="rotate(-14 67 70)" />
      {/* 날개 무늬 */}
      <Circle cx="24" cy="43" r="5" fill="#3A3330" opacity="0.75" />
      <Circle cx="76" cy="43" r="5" fill="#3A3330" opacity="0.75" />
      {/* 몸통 */}
      <Rect x="45.5" y="38" width="9" height="42" rx="4.5" fill="#3A3330" />
    </G>
  );
}

// ─── 꿀벌 (위험: 쏘임) ─────────────────────────────────────────────
function Honeybee() {
  return (
    <G>
      {/* 날개 */}
      <Ellipse cx="28" cy="38" rx="16" ry="11" fill="#CFE6F5" opacity="0.9" transform="rotate(-24 28 38)" />
      <Ellipse cx="72" cy="38" rx="16" ry="11" fill="#CFE6F5" opacity="0.9" transform="rotate(24 72 38)" />
      {/* 몸통 */}
      <Ellipse cx="50" cy="58" rx="26" ry="30" fill="#F2B434" />
      {/* 줄무늬 — 몸통 타원 안쪽에 맞춰 폭을 줄여 배치 */}
      <Rect x="27" y="47" width="46" height="8.5" rx="4.25" fill="#3A3330" />
      <Rect x="30" y="63" width="40" height="8.5" rx="4.25" fill="#3A3330" />
      <Rect x="38" y="78" width="24" height="7.5" rx="3.75" fill="#3A3330" />
      {/* 머리 */}
      <Circle cx="50" cy="26" r="15" fill="#3A3330" />
      <Circle cx="44" cy="24" r="3.6" fill="#FFFFFF" />
      <Circle cx="56" cy="24" r="3.6" fill="#FFFFFF" />
      {/* 더듬이 */}
      <Path d="M42 14 C39 8 36 6 33 5" stroke="#3A3330" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <Path d="M58 14 C61 8 64 6 67 5" stroke="#3A3330" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </G>
  );
}

// ─── 민들레 ────────────────────────────────────────────────────────
function Dandelion() {
  return (
    <G>
      {/* 줄기 */}
      <Path d="M50 52 C50 68 49 78 47 92" stroke="#5E9E4A" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* 잎 */}
      <Path d="M47 78 C36 76 28 68 27 58 C38 58 46 66 47 78 Z" fill="#6BAE5A" />
      <Path d="M49 88 C60 87 68 80 70 71 C59 70 50 77 49 88 Z" fill="#7CBF69" />
      {/* 꽃잎 (바깥 → 안쪽 두 겹) */}
      <G fill="#F5C542">
        {Array.from({ length: 12 }).map((_, i) => (
          <Ellipse
            key={i}
            cx="50"
            cy="24"
            rx="6"
            ry="14"
            transform={`rotate(${i * 30} 50 38)`}
          />
        ))}
      </G>
      <G fill="#FFD966">
        {Array.from({ length: 8 }).map((_, i) => (
          <Ellipse
            key={i}
            cx="50"
            cy="30"
            rx="5"
            ry="9"
            transform={`rotate(${i * 45 + 22} 50 38)`}
          />
        ))}
      </G>
      <Circle cx="50" cy="38" r="8" fill="#E8A317" />
    </G>
  );
}

// ─── 개나리 ────────────────────────────────────────────────────────
function Forsythia() {
  return (
    <G>
      {/* 가지 */}
      <Path d="M22 12 C36 34 46 56 54 92" stroke="#8A6E4B" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* 네 갈래 꽃 3송이 */}
      {[
        { x: 33, y: 28, s: 1 },
        { x: 62, y: 50, s: 1.15 },
        { x: 38, y: 68, s: 0.95 },
      ].map((f, i) => (
        <G key={i} transform={`translate(${f.x} ${f.y}) scale(${f.s})`}>
          {Array.from({ length: 4 }).map((_, p) => (
            <Ellipse
              key={p}
              cx="0"
              cy="-13"
              rx="6.5"
              ry="12"
              fill="#F7CE3E"
              transform={`rotate(${p * 90})`}
            />
          ))}
          <Circle cx="0" cy="0" r="5" fill="#E0A81F" />
        </G>
      ))}
    </G>
  );
}

// ─── 닭의장풀 ──────────────────────────────────────────────────────
function Dayflower() {
  return (
    <G>
      {/* 줄기 · 잎 */}
      <Path d="M50 50 C51 66 50 78 48 92" stroke="#5E9E4A" strokeWidth="5" fill="none" strokeLinecap="round" />
      <Path d="M48 82 C36 79 29 70 29 61 C40 62 47 71 48 82 Z" fill="#6BAE5A" />
      <Path d="M50 72 C61 70 69 63 70 54 C59 54 51 61 50 72 Z" fill="#7CBF69" />
      {/* 파란 꽃잎 두 장(닭의장풀 특징) */}
      <Ellipse cx="35" cy="34" rx="18" ry="15" fill="#5B8FD6" transform="rotate(-16 35 34)" />
      <Ellipse cx="65" cy="34" rx="18" ry="15" fill="#6B9EE3" transform="rotate(16 65 34)" />
      {/* 아래 흰 꽃잎 */}
      <Ellipse cx="50" cy="50" rx="9" ry="7" fill="#F3F6FB" />
      {/* 노란 수술 */}
      <Circle cx="44" cy="44" r="4.2" fill="#F5C542" />
      <Circle cx="56" cy="44" r="4.2" fill="#F5C542" />
      <Circle cx="50" cy="38" r="3.6" fill="#FFD966" />
    </G>
  );
}

// ─── 옻나무 (위험: 접촉 피부염) ────────────────────────────────────
function LacquerTree() {
  return (
    <G>
      {/* 잎자루 */}
      <Path d="M50 92 C50 70 50 44 50 16" stroke="#8A6E4B" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      {/* 마주나는 깃꼴겹잎 */}
      {[
        { y: 28, s: 0.85 },
        { y: 48, s: 1 },
        { y: 68, s: 0.9 },
      ].map((l, i) => (
        <G key={i}>
          <Ellipse
            cx={50 - 20 * l.s}
            cy={l.y}
            rx={17 * l.s}
            ry={9 * l.s}
            fill="#C0553C"
            transform={`rotate(-14 ${50 - 20 * l.s} ${l.y})`}
          />
          <Ellipse
            cx={50 + 20 * l.s}
            cy={l.y}
            rx={17 * l.s}
            ry={9 * l.s}
            fill="#D46A4A"
            transform={`rotate(14 ${50 + 20 * l.s} ${l.y})`}
          />
        </G>
      ))}
      {/* 끝 잎 */}
      <Ellipse cx="50" cy="14" rx="10" ry="13" fill="#C0553C" />
    </G>
  );
}

// ─── 광대버섯 (위험: 먹으면 독) ────────────────────────────────────
function FlyAgaric() {
  return (
    <G>
      {/* 대 */}
      <Path
        d="M40 56 L40 84 C40 89 44 92 50 92 C56 92 60 89 60 84 L60 56 Z"
        fill="#F5EFE2"
      />
      {/* 턱받이 */}
      <Ellipse cx="50" cy="62" rx="15" ry="5.5" fill="#E6DCC8" />
      {/* 갓 */}
      <Path d="M12 56 C12 32 29 16 50 16 C71 16 88 32 88 56 Z" fill="#D9453C" />
      {/* 갓 위 흰 반점 */}
      <Ellipse cx="32" cy="38" rx="7" ry="5.5" fill="#FBF7EC" />
      <Ellipse cx="55" cy="30" rx="6" ry="4.8" fill="#FBF7EC" />
      <Ellipse cx="70" cy="45" rx="6.5" ry="5" fill="#FBF7EC" />
      <Ellipse cx="43" cy="50" rx="5.5" ry="4.2" fill="#FBF7EC" />
      <Ellipse cx="24" cy="50" rx="4.5" ry="3.6" fill="#FBF7EC" />
    </G>
  );
}

// ─── 미지의 종 ─────────────────────────────────────────────────────
function UnknownArt() {
  return (
    <G>
      <Circle cx="50" cy="50" r="34" fill="#DCD4CC" />
      <Path
        d="M40 40 C40 30 45 25 51 25 C58 25 62 30 62 36 C62 44 52 45 52 54"
        stroke="#8E8279"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="52" cy="68" r="4.8" fill="#8E8279" />
    </G>
  );
}

/** 시드된 8종 + 초기 mock 종 별칭. 키는 normalizeId() 를 거친 형태. */
const ART: Record<string, () => React.JSX.Element> = {
  ladybug: Ladybug,
  'cabbage-white': CabbageWhite,
  honeybee: Honeybee,
  bee: Honeybee,
  dandelion: Dandelion,
  forsythia: Forsythia,
  dayflower: Dayflower,
  'lacquer-tree': LacquerTree,
  'fly-agaric': FlyAgaric,
  butterfly: CabbageWhite,
};
