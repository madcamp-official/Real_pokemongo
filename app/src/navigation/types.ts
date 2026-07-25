/**
 * 내비게이션 파라미터 타입 정의.
 * Phase 진행에 따라 스택별 상세 화면 파라미터를 확장한다.
 */
import type { ConsentPayload } from '@/types/api';
export type RootTabParamList = {
  Camera: undefined; // F2 촬영
  Dex: undefined; // F5 도감
  Garden: undefined; // F16 홈 가든
  Map: undefined; // F11 지도 & 탐험 기록
  Rewards: undefined; // F8/F10 보상함(배지·퀘스트)
  Settings: undefined; // F18 설정
};

/** 온보딩/전환 흐름 공통 모드. 최초 가입과 게스트→정식 전환이 동일 화면을 재사용한다. */
export type AuthFlowMode = 'signup' | 'convert';

export type RootStackParamList = {
  // ── 온보딩 (F1, 단일 사용자 계정) ────────────────────
  Tutorial: undefined;
  Choice: undefined;
  Login: undefined;
  Consent: { mode: AuthFlowMode };
  Signup: { mode: AuthFlowMode; consent: ConsentPayload };
  // ── 메인 앱 ──────────────────────────────────────────
  Main: undefined;
  // ── 상세 (F4/F6) ─────────────────────────────────────
  SpeciesCard: { speciesId: string };
  IdentifyResult: { uploadId: string };
};
