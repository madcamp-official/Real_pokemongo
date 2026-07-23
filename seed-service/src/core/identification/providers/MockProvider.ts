/**
 * Mock 동정 프로바이더 (개발/데모용).
 *
 * 외부 API 키가 없어도 전체 파이프라인을 돌려볼 수 있게 한다.
 * 실제 인식은 하지 않고, 주입된 시나리오(또는 이미지 바이트 해시)로 결정론적 결과를 낸다.
 * 프로덕션에서는 config.assertProductionConfig() 가 Mock 단독 동작을 막는다.
 */
import type {
  IdentificationProvider,
  IdentifyInput,
  ProviderResult,
} from "../IdentificationProvider.js";
import type { TaxonGroup } from "../../domain/types.js";

export interface MockScenario {
  scientificName: string;
  vernacularName?: string;
  rank: "species" | "genus" | "family";
  confidence: number;
}

export class MockProvider implements IdentificationProvider {
  readonly name = "mock";
  readonly supports: readonly TaxonGroup[] = [
    "plant",
    "insect",
    "fungus",
    "other",
  ];

  /**
   * identify()가 실제로 호출된 횟수. 테스트에서 "비용 발생 경로(외부 호출)가
   * 정말 차단됐는지"를 검증하는 데 쓴다(예: 일일 한도 초과 시 호출 0이어야 함).
   */
  identifyCalls = 0;

  /**
   * identify()가 마지막으로 받은 입력. 테스트에서 "프로바이더(=외부 전송 직전)가 받은
   * 이미지 바이트에 EXIF 가 없는지" 검증하는 데 쓴다.
   */
  lastInput: IdentifyInput | null = null;

  /**
   * @param queue 호출 순서대로 반환할 시나리오. 비면 낮은 확신도 결과를 낸다.
   */
  constructor(private queue: MockScenario[][] = []) {}

  isConfigured(): boolean {
    return true; // 항상 사용 가능
  }

  /** 테스트에서 다음 결과를 밀어넣는다. */
  enqueue(candidates: MockScenario[]): void {
    this.queue.push(candidates);
  }

  async identify(input: IdentifyInput): Promise<ProviderResult> {
    this.identifyCalls++;
    this.lastInput = input;
    const scenario = this.queue.shift();
    if (!scenario || scenario.length === 0) {
      return {
        source: "mock",
        candidates: [
          {
            scientificName: "Unknown sp.",
            rank: "family",
            confidence: 0.2,
          },
        ],
      };
    }
    return {
      source: "mock",
      candidates: scenario
        .map((s) => ({
          scientificName: s.scientificName,
          vernacularName: s.vernacularName,
          rank: s.rank,
          confidence: s.confidence,
        }))
        .sort((a, b) => b.confidence - a.confidence),
    };
  }
}
