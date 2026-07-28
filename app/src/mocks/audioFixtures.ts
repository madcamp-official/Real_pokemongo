import type {
  AudioConfirmResponse,
  AudioIdentifyResponse,
  AudioSimilarityResponse,
  AudioSightingUploadResponse,
  SpeciesSoundsResponse,
} from '@/types/api';

/**
 * docs/audio/fixtures의 런타임 사본.
 * Metro의 app 루트 밖 JSON import 제약 때문에 이 값을 사용하며, 계약 변경 시
 * docs/audio fixture와 함께 반드시 갱신한다.
 */
export const mockAudioUploadSuccess: AudioSightingUploadResponse = {
  audio_sighting_id: 'audio-sighting-fixture-001',
  status: 'ready',
  quality: {
    usable: true,
    duration_ms: 8120,
    active_duration_ms: 4210,
    snr_db: 17.4,
    clipping_ratio: 0.001,
    silence_ratio: 0.22,
    speech_ratio: 0,
    feedback_codes: [],
    valid_segments: [{ start_ms: 1100, end_ms: 5300, quality_score: 0.87 }],
  },
  expires_at: '2026-07-29T12:00:00Z',
};

export const mockAudioIdentify: AudioIdentifyResponse = {
  audio_sighting_id: 'audio-sighting-fixture-001',
  candidates: [
    {
      species_id: 'taxon-hypsipetes-amaurotis',
      common_name_ko: '직박구리',
      scientific_name: 'Hypsipetes amaurotis',
      confidence: 0.87,
      confidence_level: 'high',
      start_ms: 1100,
      end_ms: 5300,
      is_dangerous: false,
    },
  ],
  unknown: false,
  needs_user_confirmation: true,
  model_version: 'birdnet@audio-mvp-1.0.0',
  location_prior_used: false,
};

export const mockAudioConfirm: AudioConfirmResponse = {
  observation_id: 'observation-audio-fixture-001',
  modality: 'audio',
  species_id: 'taxon-hypsipetes-amaurotis',
  dex_updated: true,
  reward: { xp: 10, quest_ids: [] },
};

export const mockAudioSimilarity: AudioSimilarityResponse = {
  audio_sighting_id: 'audio-sighting-fixture-001',
  species_id: 'taxon-hypsipetes-amaurotis',
  score: 78,
  grade: 'very_similar',
  score_reliability: 'high',
  matched_segment: { start_ms: 1100, end_ms: 5300 },
  feedback_codes: [],
  model_version: 'birdnet@audio-mvp-1.0.0',
  reference_set_version: 'kr-bird-reference@2026-07',
};

export const mockSpeciesSounds: SpeciesSoundsResponse = {
  species_id: 'taxon-hypsipetes-amaurotis',
  supported_for_similarity: true,
  reference_set_version: 'kr-bird-reference@2026-07',
  clips: [],
};
