import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer } from 'expo-audio';
import { isAxiosError } from 'axios';
import {
  confirmAudioIdentification,
  deleteAudioSighting,
  identifyAudioSighting,
  getSpeciesSounds,
  scoreAudioSimilarity,
  uploadAudioSighting,
  type UploadAudioSightingParams,
} from '@/api/audio';
import { requestLocationAndGet } from '@/services/location';
import { deleteRecordedAudio } from '@/services/audioStorage';
import { MAX_AUDIO_DURATION_MS, MIN_AUDIO_DURATION_MS, useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useSettingsStore } from '@/store/settingsStore';
import { queryClient } from '@/api/queryClient';
import { colors } from '@/theme/colors';
import type {
  AudioIdentifyCandidate,
  AudioIdentifyResponse,
  AudioQualityFeedbackCode,
  AudioSimilarityResponse,
  AudioSightingUploadResponse,
} from '@/types/api';
import type { RootTabParamList } from '@/navigation/types';

type Workflow =
  | 'ready'
  | 'recording'
  | 'local_checking'
  | 'uploading'
  | 'identifying'
  | 'result'
  | 'scoring'
  | 'confirming'
  | 'confirmed'
  | 'quality_rejected'
  | 'error';

type Nav = BottomTabNavigationProp<RootTabParamList>;

const qualityMessage: Record<AudioQualityFeedbackCode, string> = {
  TOO_SHORT: '소리가 너무 짧아요. 3초 이상 녹음해 주세요.',
  MOSTLY_SILENCE: '생물 소리가 잘 들리지 않아요. 조용한 곳에서 다시 담아볼까요?',
  TOO_NOISY: '주변 소음이 너무 커요. 바람이나 차량 소음을 피해 주세요.',
  CLIPPED: '소리가 너무 커서 찌그러졌어요. 기기를 조금 멀리 두어 보세요.',
  SPEECH_DETECTED: '사람 목소리가 포함되어 분석하지 않았어요. 대화가 없는 곳에서 다시 시도해 주세요.',
  MULTIPLE_OVERLAP: '여러 소리가 겹쳐 있어요. 한 소리가 잘 들릴 때 다시 녹음해 주세요.',
  UNSUPPORTED_SOUND: '아직 지원하지 않는 소리예요.',
  NO_TARGET_ACTIVITY: '비교할 생물 소리 구간을 찾지 못했어요.',
};

const similarityGrade: Record<AudioSimilarityResponse['grade'], string> = {
  low_similarity: '낮은 유사도',
  somewhat_similar: '조금 비슷해요',
  very_similar: '많이 비슷해요',
  strong_match: '매우 비슷해요',
};

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const serverMessage = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;
    if (!error.response) return '서버에 연결하지 못했어요. 네트워크를 확인해 주세요.';
    return '소리를 처리하는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  }
  if (error instanceof Error && error.message) return error.message;
  return '연결을 확인하고 다시 시도해 주세요.';
}

function qualityDescription(codes: AudioQualityFeedbackCode[]): string {
  return codes.map((code) => qualityMessage[code]).join('\n');
}

function formatTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `00:${String(seconds).padStart(2, '0')}`;
}

/**
 * Audio MVP 단일 화면 흐름.
 * 사진 촬영 화면과 컨트롤·상태를 공유하지 않아 카메라 제스처와 로딩 UI에 영향을 주지 않는다.
 */
export default function SoundScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const audioRecordingEnabled = useSettingsStore((s) => s.audioRecordingEnabled);
  const setAudioRecordingEnabled = useSettingsStore((s) => s.setAudioRecordingEnabled);
  const locationCollectionEnabled = useSettingsStore((s) => s.locationCollectionEnabled);
  const { recorderState, interrupted, interruptedUri, startRecording, stopRecording } = useAudioRecorder();

  const [workflow, setWorkflow] = useState<Workflow>('ready');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [audioSightingId, setAudioSightingId] = useState<string | null>(null);
  const [identifyResult, setIdentifyResult] = useState<AudioIdentifyResponse | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<AudioIdentifyCandidate | null>(null);
  const [qualityFailures, setQualityFailures] = useState<AudioQualityFeedbackCode[]>([]);
  const [similarity, setSimilarity] = useState<AudioSimilarityResponse | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  /** 업로드 실패 시 같은 client_recording_id로 다시 보낼 수 있는 최소 정보. */
  const [pendingUpload, setPendingUpload] = useState<UploadAudioSightingParams | null>(null);
  const confirmationId = useRef<string | null>(null);
  const finishingRef = useRef(false);

  const loadingLabel = useMemo(() => {
    switch (workflow) {
      case 'local_checking':
        return '소리를 확인하는 중…';
      case 'uploading':
        return '안전하게 보내는 중…';
      case 'identifying':
        return '어떤 친구인지 찾는 중…';
      case 'scoring':
        return '참조 소리와 비교하는 중…';
      case 'confirming':
        return '도감에 기록하는 중…';
      default:
        return '';
    }
  }, [workflow]);
  const isLoading = !!loadingLabel;

  const clearSession = useCallback(async (removeRemote: boolean) => {
    if (removeRemote && audioSightingId) {
      await deleteAudioSighting(audioSightingId).catch(() => undefined);
    }
    deleteRecordedAudio(recordingUri);
    setRecordingUri(null);
    setAudioSightingId(null);
    setIdentifyResult(null);
    setSelectedCandidate(null);
    setQualityFailures([]);
    setSimilarity(null);
    setFailureMessage(null);
    setPendingUpload(null);
    confirmationId.current = null;
    setWorkflow('ready');
  }, [audioSightingId, recordingUri]);

  const uploadAndIdentify = useCallback(async (uploadInput: UploadAudioSightingParams) => {
    setWorkflow('uploading');
    const upload: AudioSightingUploadResponse = await uploadAudioSighting(uploadInput);
    setAudioSightingId(upload.audio_sighting_id);

    // 서버가 임시 분석본을 보관하므로 앱 원본은 업로드 직후 지운다.
    deleteRecordedAudio(uploadInput.uri);
    setRecordingUri(null);
    setPendingUpload(null);

    if (!upload.quality.usable) {
      setQualityFailures(
        upload.quality.feedback_codes.length > 0
          ? upload.quality.feedback_codes
          : ['NO_TARGET_ACTIVITY'],
      );
      setWorkflow('quality_rejected');
      return;
    }

    setWorkflow('identifying');
    const result = await identifyAudioSighting(upload.audio_sighting_id);
    setIdentifyResult(result);
    setSelectedCandidate(result.candidates[0] ?? null);
    setWorkflow('result');
  }, []);

  const finishAndAnalyze = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      const recording = await stopRecording();
      if (!recording) return;
      setRecordingUri(recording.uri);

      if (interrupted) {
        deleteRecordedAudio(recording.uri);
        setFailureMessage('녹음이 중단되었어요. 화면을 보고 있을 때 다시 녹음해 주세요.');
        setWorkflow('error');
        return;
      }
      if (recording.durationMs < MIN_AUDIO_DURATION_MS) {
        deleteRecordedAudio(recording.uri);
        setQualityFailures(['TOO_SHORT']);
        setWorkflow('quality_rejected');
        return;
      }

      setWorkflow('local_checking');
      const coord = locationCollectionEnabled ? await requestLocationAndGet() : null;
      const uploadInput: UploadAudioSightingParams = {
        uri: recording.uri,
        clientRecordingId: createId('audio'),
        durationMs: recording.durationMs,
        recordedAt: new Date().toISOString(),
        coord,
      };
      setPendingUpload(uploadInput);
      await uploadAndIdentify(uploadInput);
    } catch (error) {
      setFailureMessage(errorMessage(error));
      setWorkflow('error');
    } finally {
      finishingRef.current = false;
    }
  }, [interrupted, locationCollectionEnabled, stopRecording, uploadAndIdentify]);

  const beginRecording = useCallback(async () => {
    setQualityFailures([]);
    setFailureMessage(null);
    setSimilarity(null);
    const started = await startRecording().catch(() => false);
    if (!started) {
      setFailureMessage('마이크 권한이 필요해요. 설정에서 마이크를 허용한 뒤 다시 시도해 주세요.');
      setWorkflow('error');
      return;
    }
    setWorkflow('recording');
  }, [startRecording]);

  useEffect(() => {
    if (
      workflow === 'recording' &&
      recorderState.isRecording &&
      recorderState.durationMillis >= MAX_AUDIO_DURATION_MS
    ) {
      void finishAndAnalyze();
    }
  }, [finishAndAnalyze, recorderState.durationMillis, recorderState.isRecording, workflow]);

  useEffect(() => {
    if (interruptedUri) deleteRecordedAudio(interruptedUri);
  }, [interruptedUri]);

  useEffect(() => {
    if (!interrupted || workflow !== 'recording') return;
    setFailureMessage('녹음이 중단되었어요. 화면을 보고 있을 때 다시 녹음해 주세요.');
    setWorkflow('error');
  }, [interrupted, workflow]);

  const confirmSelected = async () => {
    if (!audioSightingId || !selectedCandidate?.species_id) return;
    if (!confirmationId.current) confirmationId.current = createId('confirmation');
    setWorkflow('confirming');
    try {
      await confirmAudioIdentification(audioSightingId, selectedCandidate.species_id, confirmationId.current);
      void queryClient.invalidateQueries({ queryKey: ['dex'] });
      void queryClient.invalidateQueries({ queryKey: ['map', 'pins'] });
      void queryClient.invalidateQueries({ queryKey: ['xp-profile'] });
      void queryClient.invalidateQueries({ queryKey: ['quests', 'active'] });
      setWorkflow('confirmed');
    } catch (error) {
      setFailureMessage(errorMessage(error));
      setWorkflow('error');
    }
  };

  const scoreSelected = async () => {
    if (!audioSightingId || !selectedCandidate?.species_id) return;
    setWorkflow('scoring');
    try {
      const result = await scoreAudioSimilarity(audioSightingId, selectedCandidate.species_id);
      setSimilarity(result);
      setWorkflow('result');
    } catch (error) {
      setFailureMessage(errorMessage(error));
      setWorkflow('error');
    }
  };

  const retryLast = () => {
    if (pendingUpload) {
      void uploadAndIdentify(pendingUpload).catch((error) => {
        setFailureMessage(errorMessage(error));
        setWorkflow('error');
      });
      return;
    }
    if (audioSightingId && !identifyResult) {
      setWorkflow('identifying');
      void identifyAudioSighting(audioSightingId)
        .then((result) => {
          setIdentifyResult(result);
          setSelectedCandidate(result.candidates[0] ?? null);
          setWorkflow('result');
        })
        .catch((error) => {
          setFailureMessage(errorMessage(error));
          setWorkflow('error');
        });
      return;
    }
    void clearSession(true);
  };

  const leave = () => {
    if (recorderState.isRecording) {
      // 화면을 닫는 것은 분석 요청이 아니라 취소다. 미완성 녹음은 서버로 보내지 않는다.
      void stopRecording()
        .then((recording) => deleteRecordedAudio(recording?.uri))
        .finally(() => void clearSession(true));
      navigation.navigate('Map');
      return;
    }
    void clearSession(workflow !== 'confirmed').finally(() => navigation.navigate('Map'));
  };

  if (!audioRecordingEnabled) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}> 
        <Header onClose={() => navigation.navigate('Map')} />
        <View style={styles.consentBody}>
          <Text style={styles.heroEmoji}>🎙️</Text>
          <Text style={styles.title}>소리로 친구를{`\n`}찾아볼까요?</Text>
          <Text style={styles.description}>
            주변 생물 소리를 최대 15초 녹음해 찾아봐요.{`\n`}사람 대화가 들어간 녹음은 분석하지 않아요.
          </Text>
          <Text style={styles.notice}>미확정 녹음은 최대 24시간 뒤 자동으로 삭제돼요.</Text>
          <PrimaryButton
            label="동의하고 시작하기"
            onPress={() => setAudioRecordingEnabled(true)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}> 
      <Header onClose={leave} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {workflow === 'ready' && (
          <ReadyPanel onRecord={() => void beginRecording()} />
        )}

        {workflow === 'recording' && (
          <RecordingPanel
            durationMs={recorderState.durationMillis}
            metering={recorderState.metering}
            onStop={() => void finishAndAnalyze()}
          />
        )}

        {workflow === 'quality_rejected' && qualityFailures.length > 0 && (
          <MessagePanel
            emoji={qualityFailures.includes('SPEECH_DETECTED') ? '🔒' : '🎧'}
            title="이번 소리는 분석하기 어려워요"
            description={qualityDescription(qualityFailures)}
            actionLabel="다시 녹음"
            onAction={() => void clearSession(true)}
          />
        )}

        {workflow === 'error' && (
          <MessagePanel
            emoji="📡"
            title="소리를 처리하지 못했어요"
            description={failureMessage ?? '잠시 후 다시 시도해 주세요.'}
            actionLabel={pendingUpload || (audioSightingId && !identifyResult) ? '다시 시도' : '다시 녹음'}
            onAction={retryLast}
          />
        )}

        {workflow === 'result' && identifyResult && (
          <ResultPanel
            result={identifyResult}
            selected={selectedCandidate}
            similarity={similarity}
            onSelect={setSelectedCandidate}
            onConfirm={() => void confirmSelected()}
            onScore={() => void scoreSelected()}
            onRetry={() => void clearSession(true)}
          />
        )}

        {workflow === 'confirmed' && selectedCandidate && (
          <MessagePanel
            emoji="🌿"
            title={`${selectedCandidate.common_name_ko}을(를) 기록했어요!`}
            description="소리로 만난 친구가 도감에 추가되었어요."
            actionLabel="탐험 지도로 돌아가기"
            onAction={leave}
          />
        )}
      </ScrollView>

      <LoadingOverlay visible={isLoading} label={loadingLabel} />
    </View>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="소리 찾기 닫기" style={styles.closeButton}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
      <Text style={styles.headerTitle}>소리 찾기</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function ReadyPanel({ onRecord }: { onRecord: () => void }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.heroEmoji}>🐦</Text>
      <Text style={styles.title}>주변 생물의 소리를{`\n`}들려주세요</Text>
      <Text style={styles.description}>6~10초 정도, 한 소리가 잘 들릴 때 녹음하면 더 정확해요.</Text>
      <View style={styles.tips}>
        <Text style={styles.tip}>• 동물을 따라가거나 가까이 가지 않아요.</Text>
        <Text style={styles.tip}>• 사람 대화가 들리지 않는 곳에서 녹음해요.</Text>
        <Text style={styles.tip}>• 최대 15초 뒤에는 자동으로 멈춰요.</Text>
      </View>
      <PrimaryButton label="소리 녹음하기" onPress={onRecord} />
    </View>
  );
}

function RecordingPanel({
  durationMs,
  metering,
  onStop,
}: {
  durationMs: number;
  metering?: number;
  onStop: () => void;
}) {
  const level = Math.max(0.18, Math.min(1, ((metering ?? -60) + 60) / 60));
  return (
    <View style={styles.panel}>
      <Text style={styles.recordingLabel}>● 녹음 중</Text>
      <Text style={styles.timer}>{formatTime(durationMs)} / 00:15</Text>
      <View style={styles.meterTrack} accessibilityLabel="현재 녹음 음량">
        <View style={[styles.meterFill, { width: `${Math.round(level * 100)}%` }]} />
      </View>
      <Text style={styles.description}>소리 나는 방향을 향해 조용히 기다려 주세요.</Text>
      <Pressable onPress={onStop} style={styles.stopButton} accessibilityRole="button" accessibilityLabel="녹음 멈추기">
        <View style={styles.stopSquare} />
      </Pressable>
      <Text style={styles.stopHint}>눌러서 녹음 끝내기</Text>
    </View>
  );
}

function ResultPanel({
  result,
  selected,
  similarity,
  onSelect,
  onConfirm,
  onScore,
  onRetry,
}: {
  result: AudioIdentifyResponse;
  selected: AudioIdentifyCandidate | null;
  similarity: AudioSimilarityResponse | null;
  onSelect: (candidate: AudioIdentifyCandidate) => void;
  onConfirm: () => void;
  onScore: () => void;
  onRetry: () => void;
}) {
  if (result.unknown || result.candidates.length === 0) {
    return (
      <MessagePanel
        emoji="🔍"
        title="친구를 찾지 못했어요"
        description="아직 지원하지 않는 소리이거나, 생물 소리가 잘 들리지 않았어요."
        actionLabel="다시 녹음"
        onAction={onRetry}
      />
    );
  }

  return (
    <View style={styles.resultPanel}>
      <Text style={styles.eyebrow}>SOUND MATCH</Text>
      <Text style={styles.title}>어떤 친구의{`\n`}소리일까요?</Text>
      <Text style={styles.description}>가장 비슷한 후보를 골라 확인해 주세요.</Text>
      <View style={styles.candidates}>
        {result.candidates.map((candidate) => {
          const key = candidateKey(candidate);
          const active = selected !== null && candidateKey(selected) === key;
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(candidate)}
              style={[styles.candidate, active && styles.candidateActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${candidate.common_name_ko} 후보 선택`}
            >
              <Text style={styles.candidateEmoji}>🐦</Text>
              <View style={styles.candidateText}>
                <Text style={styles.candidateName}>{candidate.common_name_ko}</Text>
                <Text style={styles.scientificName}>{candidate.scientific_name}</Text>
                <Text style={styles.segmentText}>{formatTime(candidate.start_ms)}부터 들렸어요</Text>
                {!candidate.supported && (
                  <Text style={styles.unsupportedNote}>아직 도감에 없는 종이에요 · 기록은 안 돼요</Text>
                )}
              </View>
              <Text style={styles.confidence}>{candidate.confidence_level === 'high' ? '높음' : candidate.confidence_level === 'medium' ? '보통' : '낮음'}</Text>
            </Pressable>
          );
        })}
      </View>

      {selected?.is_dangerous && <Text style={styles.danger}>⚠️ 가까이 가지 말고 안전한 거리를 유지해요.</Text>}

      {similarity && (
        <View style={styles.similarityCard}>
          <Text style={styles.similarityTitle}>{selected?.common_name_ko} 소리와 {similarity.score}점 비슷해요</Text>
          <Text style={styles.similarityDesc}>{similarityGrade[similarity.grade]} · 이 점수는 종일 확률이 아니라 참조 소리와의 유사도예요.</Text>
        </View>
      )}

      <View style={styles.actions}>
        {selected && !selected.supported && (
          <Text style={styles.unsupportedNote}>
            이 종은 아직 저희 도감에 없어요. 곧 추가될 예정이에요! 지금은 기록·소리 비교를 할 수 없어요.
          </Text>
        )}
        <PrimaryButton label="이 종으로 기록하기" onPress={onConfirm} disabled={!selected?.supported} />
        <SecondaryButton label="소리 비교하기" onPress={onScore} disabled={!selected?.supported} />
        {selected?.supported && selected.species_id && <ReferenceSoundButton speciesId={selected.species_id} />}
        <Pressable onPress={onRetry} style={styles.retryButton}><Text style={styles.retryText}>다시 녹음</Text></Pressable>
      </View>
    </View>
  );
}

/** species_id가 없는(도감 미지원) 후보끼리도 구분되는 안정적인 키. */
function candidateKey(candidate: AudioIdentifyCandidate): string {
  return candidate.species_id ?? `unsupported:${candidate.scientific_name}`;
}

/** 참조 음원만 재생한다. 사용자 녹음은 앱에서 재생·영구 보관하지 않는다. */
function ReferenceSoundButton({ speciesId }: { speciesId: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [playWhenReady, setPlayWhenReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const player = useAudioPlayer(source);

  useEffect(() => {
    if (!source || !playWhenReady) return;
    player.seekTo(0);
    player.play();
    setPlayWhenReady(false);
  }, [playWhenReady, player, source]);

  const play = async () => {
    if (source) {
      player.seekTo(0);
      player.play();
      return;
    }
    setLoading(true);
    try {
      const sounds = await getSpeciesSounds(speciesId);
      const clip = sounds.clips[0];
      if (!sounds.supported_for_similarity || !clip) {
        Alert.alert('참조 소리 준비 중', '이 종의 참조 소리는 아직 준비되지 않았어요.');
        return;
      }
      setPlayWhenReady(true);
      setSource(clip.playback_url);
    } catch {
      Alert.alert('참조 소리 오류', '참조 소리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable onPress={() => void play()} disabled={loading} style={styles.referenceButton} accessibilityRole="button">
      <Text style={styles.referenceText}>{loading ? '참조 소리 불러오는 중…' : '참조 소리 듣기'}</Text>
    </Pressable>
  );
}

function MessagePanel({
  emoji,
  title,
  description,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.heroEmoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <PrimaryButton label={actionLabel} onPress={onAction} />
    </View>
  );
}

function LoadingOverlay({ visible, label }: { visible: boolean; label: string }) {
  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={[styles.loadingOverlay, !visible && styles.loadingHidden]}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingLabel}>{label}</Text>
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryButton, disabled && styles.buttonDisabled]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.secondaryButton, disabled && styles.buttonDisabled]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  closeText: { fontSize: 28, color: colors.textPrimary, marginTop: -3 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 21, fontWeight: '900', color: colors.textPrimary },
  headerSpacer: { width: 40 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  consentBody: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 16 },
  panel: { alignItems: 'center', gap: 16, backgroundColor: colors.surface, padding: 28, borderRadius: 28, borderWidth: 1, borderColor: colors.border },
  resultPanel: { gap: 14, backgroundColor: colors.surface, padding: 22, borderRadius: 28, borderWidth: 1, borderColor: colors.border },
  heroEmoji: { fontSize: 72 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { fontSize: 27, lineHeight: 36, fontWeight: '900', color: colors.textPrimary, textAlign: 'center' },
  description: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  notice: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  tips: { alignSelf: 'stretch', borderRadius: 16, backgroundColor: colors.surfaceMuted, padding: 15, gap: 6 },
  tip: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  primaryButton: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 24, paddingVertical: 16, paddingHorizontal: 18, marginTop: 6 },
  primaryText: { color: colors.onPrimary, fontSize: 16, fontWeight: '900' },
  secondaryButton: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 18 },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  buttonDisabled: { opacity: 0.4 },
  unsupportedNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  recordingLabel: { color: colors.dangerText, fontSize: 16, fontWeight: '900' },
  timer: { fontSize: 42, fontWeight: '900', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  meterTrack: { alignSelf: 'stretch', height: 14, overflow: 'hidden', borderRadius: 7, backgroundColor: colors.progressTrack },
  meterFill: { height: '100%', borderRadius: 7, backgroundColor: colors.primary },
  stopButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  stopSquare: { width: 25, height: 25, borderRadius: 5, backgroundColor: colors.onPrimary },
  stopHint: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  candidates: { gap: 10 },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  candidateActive: { borderColor: colors.primary, backgroundColor: '#FFF5F0' },
  candidateEmoji: { fontSize: 30 },
  candidateText: { flex: 1, gap: 2 },
  candidateName: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  scientificName: { color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' },
  segmentText: { color: colors.textMuted, fontSize: 11 },
  confidence: { color: colors.primaryDark, fontSize: 13, fontWeight: '900' },
  danger: { color: colors.dangerText, backgroundColor: colors.dangerBg, padding: 12, borderRadius: 14, fontSize: 13, fontWeight: '700' },
  similarityCard: { backgroundColor: colors.funFactBg, borderRadius: 16, padding: 14, gap: 5 },
  similarityTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  similarityDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  actions: { gap: 10, marginTop: 4 },
  retryButton: { alignItems: 'center', paddingVertical: 10 },
  retryText: { color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
  referenceButton: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 13, borderRadius: 22, backgroundColor: colors.funFactBg },
  referenceText: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(58,51,48,0.18)' },
  loadingHidden: { opacity: 0 },
  loadingCard: { width: 220, alignItems: 'center', gap: 14, borderRadius: 22, backgroundColor: colors.surface, padding: 24, shadowColor: '#3A3330', shadowOpacity: 0.18, shadowRadius: 16, elevation: 5 },
  loadingLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', textAlign: 'center' },
});
