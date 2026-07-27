/**
 * 혼동 종 쌍 (명세서 §7 "조건 2" — 비슷한 종끼리 서로 오분류되는 문제).
 *
 * 원본 설계(species-pool 알고리즘 분석 세션)에서 정의한 조건: "유사한 종이 후보군에
 * 여러 개 있으면, top1과 top2의 확신도 차이가 작을 때는 단정하지 말고 아이에게
 * 골라보게 해야 한다" — coverage(조건 1, facility-location으로 이미 다룸)와는 별개의
 * 축이다.
 *
 * 이 목록은 82종(seedData.ts SEED_TAXA) 전체의 BioCLIP 텍스트 임베딩(GPU+80템플릿,
 * 라이브 서비스와 동일 모델)으로 pairwise 코사인 유사도를 계산해 만들었다 — CLIP류
 * 모델은 텍스트-이미지 zero-shot 매칭이 핵심이라, 텍스트 임베딩 유사도가 실제 사진
 * 분류 시의 혼동 가능성에 대한 합리적 프록시가 된다(완벽하지 않음 — 아래 한계 참고).
 *
 * 임계값 0.60 근거: 82종 최근접 이웃 유사도 분포에서 median=0.56, p75=0.63,
 * p90=0.70 — 0.60은 median보다 뚜렷이 높으면서도 상위 쌍을 놓치지 않는 지점으로
 * 선택(전수 분포 확인 후 결정, 대략적 추정 아님). 산출 스크립트/원본 데이터:
 * research/species-pool/step2-embedding-selection/03_confusion_analysis.py,
 * confusion_analysis_raw.json.
 *
 * 알려진 한계: 텍스트 임베딩 유사도는 "같은 속/비슷한 생김새"뿐 아니라 "같은 문구로
 * 자주 묘사되는 종"에도 반응해 완벽한 시각적 유사도 프록시는 아니다(예: 네발나비 vs
 * 남방노랑나비처럼 실제로는 꽤 다르게 생긴 쌍도 포함될 수 있음). 이 목록에 있다고
 * 실제로 강등되는 게 아니라 "top1/top2 확신도 차이가 작을 때만" 강등되므로(아래
 * IdentificationGateway 사용부 참고), 오탐이 있어도 비용은 "가끔 불필요하게 아이에게
 * 되물어보는 것" 정도로 작다 — "틀릴 때 안전하게 틀린다" 원칙과 부합해 보수적으로
 * 넉넉하게 잡아뒀다.
 */

/** [학명A, 학명B] — 순서 무관(대칭). */
const RAW_PAIRS: readonly [string, string][] = [
  ["Episyrphus balteatus", "Sphaerophoria scripta"], // 호리꽃등에 vs 꼬마꽃등에
  ["Harmonia axyridis", "Coccinella septempunctata"], // 무당벌레 vs 칠성무당벌레
  ["Ecdyonurus levis", "Ecdyonurus kibunensis"], // 두점하루살이 vs 네점하루살이
  ["Celastrina argiolus", "Elkalyce argiades"], // 푸른부전나비 vs 암먹부전나비
  ["Erigeron annuus", "Erigeron canadensis"], // 개망초 vs 망초
  ["Quercus mongolica", "Quercus variabilis"], // 신갈나무 vs 굴참나무
  ["Ardea cinerea", "Ardea alba"], // 왜가리 vs 대백로
  ["Pieris rapae", "Pieris melete"], // 배추흰나비 vs 큰배추흰나비
  ["Epeorus pellucidus", "Ecdyonurus kibunensis"], // 흰부채하루살이 vs 네점하루살이
  ["Acrida cinerea", "Atractomorpha lata"], // 방아깨비 vs 섬서구메뚜기
  ["Trifolium repens", "Oxalis corniculata"], // 토끼풀 vs 괭이밥
  ["Polygonia c-aureum", "Eurema mandarina"], // 네발나비 vs 남방노랑나비
  ["Papilio xuthus", "Neptis sappho"], // 호랑나비 vs 애기세줄나비
  ["Epeorus pellucidus", "Ecdyonurus levis"], // 흰부채하루살이 vs 두점하루살이
  ["Anas platyrhynchos", "Anas zonorhyncha"], // 청둥오리 vs 흰뺨검둥오리
  ["Pieris rapae", "Celastrina argiolus"], // 배추흰나비 vs 푸른부전나비
];

/** 빠른 조회용 — "학명A||학명B"(정렬된 순서) 키 집합. */
const PAIR_KEYS: ReadonlySet<string> = new Set(
  RAW_PAIRS.map(([a, b]) => pairKey(a, b)),
);

function pairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

/** 두 학명이 알려진 혼동 쌍인지(순서 무관). 같은 학명이면 항상 false. */
export function isConfusablePair(sciA: string, sciB: string): boolean {
  if (sciA === sciB) return false;
  return PAIR_KEYS.has(pairKey(sciA, sciB));
}
