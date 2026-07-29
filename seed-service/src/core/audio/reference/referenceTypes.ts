/**
 * 8단계(참조 음원과 유사도) 도메인 타입 — `docs/audio/DATA_CONTRACT.md`의
 * "species_sound_reference"와 1:1 대응(durationMs는 예외 — audioTypes.ts 상단 관례와 같은
 * 이유로, 문서 목록에 없어도 `GET /species/:species_id/sounds` 응답을 정직하게 채우려면
 * 필요한 값이라 정당하게 확장했다. `db/migrations/0005_audio_stage8.sql` 참고).
 */
import type { TaxonId } from "../../domain/types.js";

export type SoundQualityStatus = "pending" | "approved" | "rejected";

export interface SpeciesSoundReference {
  id: string;
  taxonId: TaxonId;
  /** 영구 참조 음원 저장소(ReferenceMediaStore)의 불투명 참조 — LocalDiskMediaStore와 같은
   * 성격이지만 별도 클래스다(사용자 오디오와 달리 TTL이 없는 영구 라이선스 콘텐츠). */
  mediaRef: string;
  callType: string;
  durationMs: number;
  sourceUrl: string;
  creator: string;
  license: string;
  attribution: string;
  qualityStatus: SoundQualityStatus;
  referenceSetVersion: string;
  /** ReferenceEmbeddingStore의 불투명 참조 — 아직 임베딩을 계산하지 않은 행(이론상)이면
   * undefined일 수 있으나, 실제로는 적재 스크립트가 항상 함께 채운다. */
  embeddingRef?: string;
  embeddingModelVersion?: string;
}
