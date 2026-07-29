import type { EmbeddingClient, EmbeddingResult } from "./professorTypes.js";

export class EmbeddingUnavailableError extends Error {
  constructor(message = "도감 박사 지식 검색을 잠시 사용할 수 없어요.") {
    super(message);
    this.name = "EmbeddingUnavailableError";
  }
}

export class HttpEmbeddingClient implements EmbeddingClient {
  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs: number,
  ) {}

  async health(): Promise<Omit<EmbeddingResult, "vector">> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint.replace(/\/+$/, "")}/health`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new EmbeddingUnavailableError(`임베딩 워커 상태 확인 오류: ${response.status}`);
      }
      const result = (await response.json()) as Partial<EmbeddingResult>;
      if (
        typeof result.model_id !== "string" ||
        typeof result.model_revision !== "string" ||
        typeof result.dimension !== "number" ||
        result.normalized !== true
      ) {
        throw new EmbeddingUnavailableError("임베딩 워커의 모델 정보가 올바르지 않습니다.");
      }
      return {
        model_id: result.model_id,
        model_revision: result.model_revision,
        dimension: result.dimension,
        normalized: true,
      };
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw error;
      throw new EmbeddingUnavailableError(
        error instanceof Error ? `임베딩 워커 연결 실패: ${error.message}` : undefined,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint.replace(/\/+$/, "")}/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new EmbeddingUnavailableError(`임베딩 워커 응답 오류: ${response.status}`);
      }
      const result = (await response.json()) as Partial<EmbeddingResult>;
      validateEmbeddingResult(result);
      return result as EmbeddingResult;
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw error;
      throw new EmbeddingUnavailableError(
        error instanceof Error ? `임베딩 워커 연결 실패: ${error.message}` : undefined,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function validateEmbeddingResult(result: Partial<EmbeddingResult>): void {
  if (
    typeof result.model_id !== "string" ||
    typeof result.model_revision !== "string" ||
    typeof result.dimension !== "number" ||
    result.normalized !== true ||
    !Array.isArray(result.vector) ||
    result.vector.length !== result.dimension ||
    result.vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new EmbeddingUnavailableError("임베딩 워커가 올바르지 않은 응답을 반환했습니다.");
  }
}
