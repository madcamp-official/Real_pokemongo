/**
 * 9단계(설정과 배포) — doc03 12장 "readiness는 모델과 참조 임베딩이 모두 준비된 뒤
 * 성공한다" + 완료 기준 "CAMP-3 재부팅 또는 서비스 재시작 후 readiness가 정상 복구된다".
 *
 * `GET /audio/health`가 그대로 노출하는 순수 조회 로직 — 모델 서비스의 `/ready`(Stage 2가
 * 만든, 실제로 짧은 더미 추론까지 태워 세션이 살아있는지 확인하는 엔드포인트)를 호출하고,
 * 승인+임베딩완료된 참조 클립이 하나라도 있는지를 합쳐서 판단한다.
 *
 * 부수효과 없음(관찰/도감/퀘스트/보상과 무관) — 운영 모니터링 전용 조회다.
 */
import type { SpeciesSoundReferenceRepository } from "../repositories/ports.js";

export interface AudioHealthReport {
  ready: boolean;
  model: {
    configured: boolean;
    reachable: boolean;
    expectedVersion?: string;
  };
  referenceEmbeddings: {
    ready: boolean;
    approvedClipCount: number;
  };
}

export interface AudioHealthCheckDeps {
  modelEndpoint: string;
  modelTimeoutMs: number;
  expectedModelVersion?: string;
  references: SpeciesSoundReferenceRepository;
  /** 테스트 주입용(BirdNetAudioProvider.ts 등과 같은 전역 fetch 모킹 관례를 안 쓰고, 여기는
   * 순수 함수 성격을 유지하려고 명시적 주입을 택했다 — 이 함수 자체가 여러 라우트에서 호출될
   * 일이 없어 굳이 provider 클래스로 감쌀 필요가 없었다). */
  fetchImpl?: typeof fetch;
}

export async function checkAudioHealth(deps: AudioHealthCheckDeps): Promise<AudioHealthReport> {
  const configured = Boolean(deps.modelEndpoint);
  let reachable = false;
  if (configured) {
    try {
      const f = deps.fetchImpl ?? fetch;
      const res = await f(`${deps.modelEndpoint}/ready`, {
        signal: AbortSignal.timeout(deps.modelTimeoutMs),
      });
      reachable = res.ok;
    } catch {
      reachable = false; // 타임아웃/연결거부 등 무엇이든 "지금은 도달 불가"로 취급.
    }
  }

  const approvedClipCount = await deps.references.countApprovedWithEmbedding();
  const referenceEmbeddingsReady = approvedClipCount > 0;

  return {
    ready: configured && reachable && referenceEmbeddingsReady,
    model: { configured, reachable, expectedVersion: deps.expectedModelVersion },
    referenceEmbeddings: { ready: referenceEmbeddingsReady, approvedClipCount },
  };
}
