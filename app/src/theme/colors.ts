/**
 * 앱 공용 색상 팔레트.
 * Phase 3 디자인 시안(코랄+크림 톤)을 기준으로 정의한다.
 * 이후 화면들은 이 토큰을 참조하고, 초기(온보딩/카메라) 화면도 점진적으로 이 팔레트로 수렴.
 */
export const colors = {
  // 배경/표면
  background: '#FBEEE6', // 따뜻한 크림/피치
  surface: '#FFFFFF',
  surfaceMuted: '#F3EAE3',

  // 주요 강조 (코랄)
  primary: '#F08A6E',
  primaryDark: '#E3765A',
  onPrimary: '#FFFFFF',
  progressTrack: '#F6DBCF',

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
