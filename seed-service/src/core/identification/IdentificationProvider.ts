/**
 * 동정 프로바이더 인터페이스 (명세서 F3 "동정 게이트웨이").
 *
 * 핵심 설계(명세서 §9): 동정 로직을 특정 벤더에 하드코딩하지 않는다.
 * 모든 외부 동정 API(Plant.id, insect.id, PlantNet, 훗날 자체 모델)는 이 인터페이스
 * 뒤의 "어댑터"로 구현된다. 프로바이더 교체가 코드 1곳(게이트웨이 조립부) 변경으로 끝난다.
 */
import type { TaxonGroup, TaxonRank } from "../domain/types.js";
import type { SanitizedImage } from "../media/MediaSanitizer.js";

/** 동정 요청 입력. 미디어는 저장소 참조 또는 원본 바이트. */
export interface IdentifyInput {
  /**
   * 정화(메타데이터 제거)를 마친 이미지. **원시 Uint8Array 를 받지 않는다** —
   * EXIF GPS 가 박힌 아동 사진이 외부 동정 API 로 그대로 나가는 것을 타입 수준에서 막는다
   * (체크리스트 §1.4). SanitizedImage 는 MediaSanitizer.sanitizeImage() 만이 만든다.
   */
  images: SanitizedImage[];
  /** 힌트: 대략적인 대상군(사용자가 카테고리를 골랐거나 촬영 맥락에서 추정). */
  groupHint?: TaxonGroup;
  /**
   * 계절/서식지 맥락. 후보 순위 보정에 쓸 수 있다(정밀 위치 아님).
   * 프라이버시 원칙상 좌표는 받지 않는다.
   */
  season?: string;
}

/** 프로바이더가 낸 후보 하나. 벤더 원형이 아니라 정규화된 형태. */
export interface IdentificationCandidate {
  /** 벤더가 준 학명(정규화 전). 게이트웨이가 Taxon 으로 매핑한다. */
  scientificName: string;
  /** 벤더 제공 한글명(있으면). 없으면 게이트웨이가 국명 매핑으로 채운다. */
  vernacularName?: string;
  rank: TaxonRank;
  confidence: number; // 0..1
}

/** 프로바이더 응답(정규화됨). */
export interface ProviderResult {
  candidates: IdentificationCandidate[]; // confidence 내림차순 권장
  /** 어떤 프로바이더/모델이 냈는지 (Observation.source 로 기록). */
  source: string;
}

export interface IdentificationProvider {
  /** 이 프로바이더가 처리할 수 있는 생물군. 게이트웨이의 라우팅 근거. */
  readonly supports: readonly TaxonGroup[];
  /** 사람이 읽는 이름 (로깅/출처용). */
  readonly name: string;
  /** 사용 가능 여부(예: API 키 공란이면 false → 게이트웨이가 건너뜀). */
  isConfigured(): boolean;
  identify(input: IdentifyInput): Promise<ProviderResult>;
}
