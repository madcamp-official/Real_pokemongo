/**
 * 도감 박사 답변 조립에 쓰는 한글 조사 헬퍼.
 * 이름의 마지막 글자 받침 유무로 주격(은/는)·목적격(을/를) 조사를 고른다.
 * KnowledgeIndexer(지식 문장 생성)와 ProfessorService(추천 질문) 양쪽에서 공유한다.
 */

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_JONGSEONG_COUNT = 28;

function hasBatchim(name: string): boolean {
  const trimmed = name.trim();
  const lastCode = trimmed.charCodeAt(trimmed.length - 1);
  if (lastCode < HANGUL_SYLLABLE_START || lastCode > HANGUL_SYLLABLE_END) return false;
  return (lastCode - HANGUL_SYLLABLE_START) % HANGUL_JONGSEONG_COUNT !== 0;
}

/** 받침 있으면 "은", 없으면 "는"(한글이 아니면 "는"으로 폴백). */
export function topicParticleFor(name: string): string {
  const trimmed = name.trim();
  const lastCode = trimmed.charCodeAt(trimmed.length - 1);
  if (lastCode < HANGUL_SYLLABLE_START || lastCode > HANGUL_SYLLABLE_END) return "는";
  return hasBatchim(name) ? "은" : "는";
}

/** 받침 있으면 "을", 없으면 "를"(한글이 아니면 "를"로 폴백). */
export function objectParticleFor(name: string): string {
  const trimmed = name.trim();
  const lastCode = trimmed.charCodeAt(trimmed.length - 1);
  if (lastCode < HANGUL_SYLLABLE_START || lastCode > HANGUL_SYLLABLE_END) return "를";
  return hasBatchim(name) ? "을" : "를";
}

/** 받침 있으면 "과", 없으면 "와"(한글이 아니면 "와"로 폴백). */
export function withParticleFor(name: string): string {
  const trimmed = name.trim();
  const lastCode = trimmed.charCodeAt(trimmed.length - 1);
  if (lastCode < HANGUL_SYLLABLE_START || lastCode > HANGUL_SYLLABLE_END) return "와";
  return hasBatchim(name) ? "과" : "와";
}
