import type {
  ProfessorAskResponse,
  ProfessorGreeting,
  ProfessorSuggestion,
} from '@/types/api';

const EDIBILITY_PATTERN = /(먹어|먹을\s*수|식용|섭취|요리|삶아|구워|독버섯)/u;

export const mockProfessorGreeting: ProfessorGreeting = {
  message: '15종의 친구를 만났군요! 궁금한 생물 이야기를 물어보세요.',
  discovered_count: 15,
};

export const mockProfessorSuggestions: ProfessorSuggestion[] = [
  {
    id: 'ladybug-habitat',
    question: '무당벌레는 어디에서 살아요?',
    context_species_id: 'sp_ladybug',
  },
  { id: 'observe-safe', question: '생물을 안전하게 관찰하려면 어떻게 해야 해?' },
  { id: 'activity', question: '낮에 활동하는 친구는 누구야?' },
];

export function buildMockProfessorAnswer(
  question: string,
  contextSpeciesId?: string
): ProfessorAskResponse {
  if (EDIBILITY_PATTERN.test(question)) {
    const warning =
      '사진이나 설명만으로 먹어도 되는지 판단하면 위험해요. 어떤 생물이든 입에 넣지 말고, 가까운 어른에게 꼭 알려 주세요.';
    return {
      confidence: 'high',
      answer: warning,
      matched_species: null,
      safety_warning: warning,
      related: [],
      similarity_score: null,
      restricted: false,
      response_source: 'fixed_safety',
    };
  }

  if (contextSpeciesId === 'sp_bee' || /벌.*(만져|가까이|안전)/u.test(question)) {
    return {
      confidence: 'high',
      answer: '꿀벌은 꽃에서 꿀을 모으지만 쏘일 수 있으니 멀리서 관찰해요.',
      matched_species: { species_id: 'sp_bee', name: '꿀벌', discovered: true },
      safety_warning: '쏘일 수 있어요. 가까이 가지 말고 멀리서 봐요.',
      related: [],
      similarity_score: 0.86,
      restricted: false,
      response_source: 'indexed_sentence',
    };
  }

  return {
    confidence: 'high',
    answer: '무당벌레는 진딧물을 잡아먹어서 식물을 지켜주는 고마운 곤충이에요.',
    matched_species: { species_id: 'sp_ladybug', name: '무당벌레', discovered: true },
    safety_warning: null,
    related: [
      {
        species_id: 'sp_bee',
        name: '꿀벌',
        reason: '꽃 주변에서 함께 관찰할 수 있어요',
      },
    ],
    similarity_score: 0.82,
    restricted: false,
    response_source: 'indexed_sentence',
  };
}

