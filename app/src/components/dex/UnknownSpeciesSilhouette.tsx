import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import type { TaxonGroup } from '@/types/api';

interface Props {
  group: TaxonGroup;
  size?: number;
}

/**
 * 미수집 종은 실제 이름·색·세부 특징을 노출하지 않는다.
 * 분류군을 짐작할 수 있는 중립적인 실루엣만 보여 수집 동기를 만든다.
 */
export function UnknownSpeciesSilhouette({ group, size = 54 }: Props) {
  const fill = '#B7B6B7';
  const stroke = '#FFFFFF';
  const strokeWidth = 2.5;

  if (group === '식물') {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="미수집 식물">
        <Path d="M32 56V27" stroke={fill} strokeWidth={5} strokeLinecap="round" />
        <Path d="M30 40C16 39 12 27 15 20c11 0 17 8 15 20Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Path d="M34 34c3-13 14-16 20-13 1 10-7 18-20 17Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Ellipse cx="32" cy="21" rx="8" ry="9" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </Svg>
    );
  }

  if (group === '곤충') {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="미수집 곤충">
        <Ellipse cx="32" cy="34" rx="10" ry="17" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Circle cx="32" cy="17" r="7" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Ellipse cx="19" cy="31" rx="11" ry="8" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Ellipse cx="45" cy="31" rx="11" ry="8" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Path d="M25 47 16 55M39 47l9 8M24 38l-11 4M40 38l11 4" stroke={fill} strokeWidth={4} strokeLinecap="round" />
      </Svg>
    );
  }

  if (group === '조류') {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="미수집 새">
        <Ellipse cx="31" cy="37" rx="18" ry="13" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Circle cx="45" cy="25" r="9" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Path d="m53 25 9 4-9 4Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Path d="m18 39-13 9 16-2Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Path d="M27 49v8m9-7v7" stroke={fill} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    );
  }

  if (group === '양서류') {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="미수집 양서류">
        <Ellipse cx="31" cy="37" rx="19" ry="13" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Circle cx="24" cy="25" r="7" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Circle cx="39" cy="25" r="7" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <Path d="m19 44-11 10m8-1-7 4m34-13 11 10m-8-1 7 4" stroke={fill} strokeWidth={5} strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="미수집 생물">
      <Path d="M15 51c0-17 7-28 17-28s17 11 17 28Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <Rect x="12" y="50" width="40" height="7" rx="3.5" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <Circle cx="22" cy="21" r="6" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <Circle cx="42" cy="21" r="6" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </Svg>
  );
}
