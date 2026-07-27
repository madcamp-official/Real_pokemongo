import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { DecorationId } from '@/components/garden/gardenDecorations';

export function DecorationArt({
  id,
  width,
  height,
}: {
  id: DecorationId;
  width: number;
  height: number;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 140 140">
      {id === 'pond' && <Pond />}
      {id === 'bridge' && <Bridge />}
      {id === 'fruit-tree' && <Tree />}
      {id === 'bench' && <Bench />}
      {id === 'fence' && <Fence />}
      {id === 'flower-bed' && <FlowerBed />}
      {id === 'flower-arch' && <FlowerArch />}
    </Svg>
  );
}

function Pond() {
  return (
    <G>
      <Ellipse cx="70" cy="84" rx="62" ry="39" fill="#769A56" opacity="0.28" />
      <Ellipse cx="70" cy="76" rx="58" ry="34" fill="#59B9D1" />
      <Ellipse cx="70" cy="70" rx="49" ry="25" fill="#85D4E5" />
      {[18, 34, 52, 72, 94, 115, 126].map((x, i) => (
        <Circle key={x} cx={x} cy={i % 2 ? 97 : 91} r="8" fill={i % 2 ? '#C7C1A4' : '#E0DAC0'} />
      ))}
      <Ellipse cx="48" cy="68" rx="11" ry="6" fill="#6DAA55" />
      <Circle cx="98" cy="78" r="4" fill="#F4D55A" />
    </G>
  );
}

function Bridge() {
  return (
    <G transform="translate(10 42)">
      <Path d="M8 55 C35 20 88 20 122 55" stroke="#76502F" strokeWidth="9" fill="none" />
      {[18, 38, 58, 78, 98, 118].map((x) => (
        <Rect key={x} x={x - 8} y="34" width="16" height="48" rx="3" fill="#C88D4C" transform={`rotate(${(x - 68) * 0.18} ${x} 58)`} />
      ))}
    </G>
  );
}

function Tree() {
  return (
    <G>
      <Ellipse cx="70" cy="124" rx="38" ry="11" fill="#456B36" opacity="0.25" />
      <Path d="M58 126 L64 65 L76 65 L83 126 Z" fill="#8C603C" />
      <Circle cx="47" cy="55" r="34" fill="#4D9E4B" />
      <Circle cx="82" cy="43" r="37" fill="#58AE50" />
      <Circle cx="98" cy="68" r="31" fill="#489749" />
      {[47, 70, 92, 106].map((x, i) => <Circle key={x} cx={x} cy={48 + (i % 2) * 24} r="6" fill="#E45D48" />)}
    </G>
  );
}

function Bench() {
  return (
    <G transform="translate(14 38)">
      <Ellipse cx="58" cy="82" rx="55" ry="12" fill="#456B36" opacity="0.2" />
      <Rect x="10" y="25" width="100" height="18" rx="5" fill="#A96F3E" />
      <Rect x="10" y="49" width="100" height="15" rx="5" fill="#C2864A" />
      <Rect x="18" y="62" width="8" height="28" fill="#6F5137" />
      <Rect x="94" y="62" width="8" height="28" fill="#6F5137" />
    </G>
  );
}

function Fence() {
  return (
    <G transform="translate(6 42)">
      <Rect x="4" y="48" width="126" height="10" rx="4" fill="#B7824C" />
      <Rect x="4" y="73" width="126" height="10" rx="4" fill="#A97342" />
      {[10, 36, 62, 88, 114].map((x) => (
        <Path key={x} d={`M${x} 86 L${x} 22 L${x + 8} 10 L${x + 16} 22 L${x + 16} 86 Z`} fill="#D6A664" />
      ))}
    </G>
  );
}

function FlowerBed() {
  return (
    <G transform="translate(8 48)">
      <Ellipse cx="62" cy="68" rx="58" ry="26" fill="#6E984F" opacity="0.28" />
      <Ellipse cx="62" cy="58" rx="58" ry="25" fill="#5F9849" />
      {[
        [20, 48, '#F498AD'], [38, 62, '#FFE36D'], [57, 46, '#FFFFFF'],
        [76, 64, '#A98BE3'], [96, 47, '#F58B85'], [111, 63, '#FFD66C'],
      ].map(([x, y, color]) => (
        <G key={`${x}`}>
          <Rect x={Number(x) - 2} y={Number(y)} width="4" height="18" fill="#407E3C" />
          <Circle cx={Number(x)} cy={Number(y)} r="9" fill={String(color)} />
        </G>
      ))}
    </G>
  );
}

function FlowerArch() {
  return (
    <G>
      <Path d="M30 132 V67 C30 16 110 16 110 67 V132" stroke="#4D8A49" strokeWidth="12" fill="none" />
      {[31, 42, 57, 72, 88, 105, 110].map((x, i) => (
        <Circle key={x} cx={x} cy={35 + Math.abs(70 - x) * 0.42} r="9" fill={i % 2 ? '#F6B0C2' : '#FFF0A2'} />
      ))}
    </G>
  );
}
