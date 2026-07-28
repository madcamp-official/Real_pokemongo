/** 8단계 유사도 계산의 기초 — 순수 함수, GPU/네트워크 불필요. */

/** 코사인 유사도. 둘 중 하나라도 영벡터면 정의상 유사도가 없다는 뜻으로 0을 돌려준다
 * (나눗셈으로 NaN이 나오는 걸 막는다 — 실제 임베딩이 정확히 영벡터일 일은 없지만 방어적으로). */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: 차원이 다름 (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 여러 임베딩(예: 한 클립의 세그먼트들)의 평균 벡터 — 적재 스크립트가 참조 클립 하나의
 * 대표 임베딩을 만들 때 쓴다("mean-pooled embedding", Stage 2 메모와 동일 용어). */
export function meanPool(vectors: readonly (readonly number[])[]): number[] {
  if (vectors.length === 0) throw new Error("meanPool: 빈 배열");
  const dim = vectors[0]!.length;
  const sum = new Array(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) throw new Error("meanPool: 차원이 다른 벡터가 섞여 있음");
    for (let i = 0; i < dim; i++) sum[i] += v[i]!;
  }
  return sum.map((s) => s / vectors.length);
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
