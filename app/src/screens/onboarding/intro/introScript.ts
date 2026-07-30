/**
 * 회원가입 직후 재생되는 "아울 박사" 인트로 컷씬 대본.
 * 화면(IntroCutsceneScreen)은 이 배열을 순서대로 재생하며, `scene` 값에 따라
 * 배경·박사 포즈·생물 몽타주·미션 스텝 UI를 전환한다. 텍스트의 `{nickname}`은
 * 실제 플레이어 닉네임으로 치환된다.
 */

export type IntroSceneId =
  | 'world' // ① 세계 소개 — 숲 전경, 박사는 아직 화면에 없음(목소리만)
  | 'enter' // ② 박사 등장 — 부엉이가 날아와 앉고 이름이 소개된다
  | 'montage' // ③ 생물 소개 — 생물들이 빠르게 전환된다
  | 'mystery' // ④ 문제 제기 — 화면이 실루엣/미스터리 톤으로 바뀐다
  | 'greeting' // ⑤ 플레이어 소개 — 닉네임이 크게 등장한다
  | 'mission' // ⑥ 임무 부여 — 촬영→동정→학습→도감 스텝이 순서대로 나타난다
  | 'finale'; // ⑦ 첫 탐험 시작 — 박사가 날아가고 시작 버튼이 뜬다

export interface IntroBeat {
  scene: IntroSceneId;
  speaker: 'professor' | null;
  /** {nickname} 플레이스홀더를 포함할 수 있다. */
  text: string;
  /** 이 대사와 함께 화면 중앙에 큰 이름 카드를 띄운다. */
  nameCard?: { title: string; subtitle: string };
  /** mission 씬에서 지금까지 공개할 스텝 칩 개수(0~4). */
  missionStepsRevealed?: number;
}

export const INTRO_MISSION_STEPS = [
  { emoji: '📸', label: '촬영' },
  { emoji: '🔍', label: '동정' },
  { emoji: '📖', label: '학습' },
  { emoji: '📚', label: '도감' },
] as const;

/**
 * 생물 몽타주(③)에서 순서대로 보여줄 종. 실제 도감/홈가든에 이미 있는 종
 * PNG(GardenCreatureArt)만 사용한다 — 존재하지 않는 종을 새로 그릴 수 없기 때문에,
 * 곤충→나비→잠자리→새→새→꽃→버섯→뱀 순으로 앱에 실제로 등장하는 생물을 고른다.
 */
export const INTRO_MONTAGE_SPECIES = [
  'harmonia-axyridis', // 무당벌레
  'papilio-xuthus', // 호랑나비
  'orthetrum-albistylum', // 밀잠자리
  'pica-serica', // 까치
  'passer-montanus', // 참새
  'taraxacum-officinale', // 민들레
  'fly-agaric', // 광대버섯
  'rhabdophis-tigrinus', // 유혈목이
] as const;

export const INTRO_SCRIPT: IntroBeat[] = [
  // ① 세계 소개
  { scene: 'world', speaker: 'professor', text: '안녕하세요!' },
  { scene: 'world', speaker: 'professor', text: '우리가 살아가는 지구에는...' },
  { scene: 'world', speaker: 'professor', text: '수많은 생명들이 함께 살아가고 있습니다.' },

  // ② 박사 등장
  { scene: 'enter', speaker: 'professor', text: '반갑습니다!' },
  { scene: 'enter', speaker: 'professor', text: '저는 지구에 사는 다양한 생물을 연구하는' },
  {
    scene: 'enter',
    speaker: 'professor',
    text: '아울 박사입니다.',
    nameCard: { title: '아울 박사', subtitle: '생태 연구소' },
  },

  // ③ 생물 소개
  { scene: 'montage', speaker: 'professor', text: '곤충도...' },
  { scene: 'montage', speaker: 'professor', text: '새도...' },
  { scene: 'montage', speaker: 'professor', text: '식물도...' },
  { scene: 'montage', speaker: 'professor', text: '모두 저마다의 삶을 살아가고 있지요.' },

  // ④ 문제 제기
  { scene: 'mystery', speaker: 'professor', text: '하지만...' },
  { scene: 'mystery', speaker: 'professor', text: '우리는 아직' },
  { scene: 'mystery', speaker: 'professor', text: '이 세상의 모든 생물을 알고 있지는 않습니다.' },
  { scene: 'mystery', speaker: 'professor', text: '아직 발견되지 않은 생물도 있고...' },
  { scene: 'mystery', speaker: 'professor', text: '기록되지 않은 만남도 아주 많답니다.' },

  // ⑤ 플레이어 소개
  {
    scene: 'greeting',
    speaker: 'professor',
    text: '{nickname} 탐험가님.',
    nameCard: { title: '{nickname} 탐험가님', subtitle: '오늘부터 함께할 동료' },
  },
  { scene: 'greeting', speaker: 'professor', text: '당신도 오늘부터' },
  { scene: 'greeting', speaker: 'professor', text: '생태 탐험가가 되어' },
  { scene: 'greeting', speaker: 'professor', text: '새로운 생물들을 만나게 될 것입니다.' },

  // ⑥ 임무 부여
  { scene: 'mission', speaker: 'professor', text: '여러분이 만나는 생물들은', missionStepsRevealed: 0 },
  { scene: 'mission', speaker: 'professor', text: '모두 소중한 자연의 친구들입니다.', missionStepsRevealed: 0 },
  { scene: 'mission', speaker: 'professor', text: '사진을 찍고', missionStepsRevealed: 1 },
  { scene: 'mission', speaker: 'professor', text: '이름을 알아가고', missionStepsRevealed: 2 },
  { scene: 'mission', speaker: 'professor', text: '생태를 배우며', missionStepsRevealed: 3 },
  {
    scene: 'mission',
    speaker: 'professor',
    text: '나만의 생태 도감을 함께 완성해 봅시다.',
    missionStepsRevealed: 4,
  },

  // ⑦ 첫 탐험 시작
  { scene: 'finale', speaker: 'professor', text: '그럼...' },
  { scene: 'finale', speaker: 'professor', text: '첫 번째 생물을 찾아볼까요?' },
];

export function fillNickname(text: string, nickname: string): string {
  return text.replace(/\{nickname\}/g, nickname);
}
