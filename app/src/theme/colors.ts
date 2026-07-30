/**
 * 앱 공용 색상 팔레트.
 *
 * 2026-07-30 팔레트 통일: 온보딩(초록)·지도(버밀리언/올리브)·방사형 메뉴(딥그린)가
 * 서로 다른 색상을 써서 화면을 옮길 때마다 "다른 앱 같다"는 문제가 있었다. 자연 탐험
 * 앱 정체성에 맞춰 온보딩에서 쓰던 초록을 앱 전체의 주 색상(primary)으로 승격하고,
 * 기존 주 색상이던 코랄은 강조색(accent)으로 역할을 좁혔다 — "새로운 친구를
 * 발견했어요!" 같은 특별한 순간에만 쓰는 색이다(IdentifyResultScreen 참고).
 * 이 파일이 유일한 진실 공급원이며, 새 화면은 하드코딩된 hex 대신 이 토큰을 쓴다.
 */
export const colors = {
  // 배경/표면
  background: '#FBEEE6', // 따뜻한 크림/피치
  surface: '#FFFFFF',
  surfaceMuted: '#F3EAE3',

  // 주 색상 (숲 초록 — 온보딩에서 쓰던 색을 앱 전체 기본색으로 승격)
  primary: '#5B8C3E',
  primaryDark: '#46702E',
  /** 배지·선택된 칩처럼 옅은 초록 배경이 필요할 때(온보딩 아바타 선택 등과 동일 톤). */
  primaryLight: '#E4EFD8',
  onPrimary: '#FFFFFF',
  progressTrack: '#DCEECB',

  // 강조색 (따뜻한 코랄 — 예전엔 주 색상이었지만, 이제 "발견/축하" 같은 특별한
  // 순간에만 쓰는 액센트로 역할을 좁혔다)
  accent: '#F08A6E',
  accentDark: '#E3765A',
  onAccent: '#FFFFFF',

  // 텍스트
  textPrimary: '#3A3330',
  textSecondary: '#A2938A',
  textMuted: '#C4B8AF',

  // 상태
  safeBg: '#D3EDD9',
  safeText: '#3E8E5A',
  dangerBg: '#FBE0DA',
  dangerText: '#C0453B',

  // 미발견(실루엣)
  lockedCard: '#EDE6E0',
  lockedCircle: '#DBD2CB',
  lockedText: '#B9AEA6',

  // 재미있는 사실 카드
  funFactBg: '#FBEFC9',
  funFactAccent: '#E0A93E',

  // 경계선
  border: '#EFE3DA',
} as const;

/**
 * 촬영("탐험 모드") 화면 전용 토큰.
 * 카메라 프리뷰 위에 얹히는 UI라 크림/코랄 계열 대신 딥 그린 + 반투명 계열을 쓴다.
 */
export const cameraTheme = {
  /** 상·하단 비네트(딥 그린) — 컨트롤 가독성 확보용 */
  vignette: 'rgba(16, 42, 30, 0.78)',
  vignetteFade: 'rgba(16, 42, 30, 0)',
  /** 원형 아이콘 버튼 기본/활성 배경 */
  control: 'rgba(16, 42, 30, 0.5)',
  controlActive: '#F08A6E',
  /** 흰 알약(모드 라벨·힌트) */
  pill: 'rgba(255,255,255,0.95)',
  pillText: '#22402F',
  /** 카메라 위 보조 문구 */
  caption: 'rgba(255,255,255,0.7)',
} as const;

/** F4 "새로운 친구 발견" 축하 화면 배경 그라데이션 (크림 → 핑크). */
export const discoveryGradient = ['#FFF6E9', '#FCE9E4', '#F7D9E4'] as const;
/** 위험 생물 판정 시 배경 그라데이션 (크림 → 옅은 레드). */
export const alertGradient = ['#FFF3EA', '#FBE2DB', '#F6D2CC'] as const;
/** 옅은 초록 배경 워시(방사형 메뉴 등 primary 톤의 은은한 배경이 필요할 때). */
export const primaryGradient = ['#D8F0C6', '#EFF9E4', '#E2F5D3'] as const;

/** 종 카드 히어로/썸네일 배경 등 파스텔 톤 모음. */
export const pastels = {
  pink: '#F7D7DE',
  tan: '#E7D6C4',
  green: '#CFEAC9',
  cream: '#EFE4CE',
  gray: '#E8E4DF',
  purple: '#DED4F1',
  blue: '#D2E4F0',
} as const;

export type PastelKey = keyof typeof pastels;
