export interface GardenFenceBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  gateLeft: number;
  gateRight: number;
}

/**
 * 배경에 직접 그려진 레벨별 울타리의 안쪽 배치 가능 영역.
 * 울타리는 이미지에 포함하되, 장식 배치는 이 경계를 넘지 않게 제한한다.
 */
export function getGardenFenceBounds(level: number): GardenFenceBounds {
  if (level >= 5) {
    return { left: 24, right: 1656, top: 22, bottom: 690, gateLeft: 700, gateRight: 980 };
  }
  if (level >= 3) {
    return { left: 55, right: 1625, top: 55, bottom: 675, gateLeft: 715, gateRight: 965 };
  }
  return { left: 85, right: 1595, top: 105, bottom: 650, gateLeft: 730, gateRight: 950 };
}
