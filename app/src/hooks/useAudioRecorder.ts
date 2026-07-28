import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder as useExpoAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

export const MIN_AUDIO_DURATION_MS = 3_000;
export const MAX_AUDIO_DURATION_MS = 15_000;

export interface RecordedAudio {
  uri: string;
  durationMs: number;
}

/**
 * 사용자 행동으로만 동작하는 foreground 녹음 훅.
 * 파일은 Expo Audio의 document 디렉터리에 만들고, SoundScreen이 업로드 뒤 또는 폐기 시 삭제한다.
 */
export function useAudioRecorder() {
  const recorder = useExpoAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document',
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 150);
  const stoppingRef = useRef(false);
  const [interrupted, setInterrupted] = useState(false);
  const [interruptedUri, setInterruptedUri] = useState<string | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    return status.granted;
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (recorderState.isRecording || stoppingRef.current) return false;
    const granted = await requestPermission();
    if (!granted) return false;
    setInterrupted(false);
    setInterruptedUri(null);
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }, [recorder, recorderState.isRecording, requestPermission]);

  const stopRecording = useCallback(async (): Promise<RecordedAudio | null> => {
    if (!recorderState.isRecording || stoppingRef.current) return null;
    stoppingRef.current = true;
    const durationMs = recorderState.durationMillis;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      return uri ? { uri, durationMs } : null;
    } finally {
      stoppingRef.current = false;
    }
  }, [recorder, recorderState.durationMillis, recorderState.isRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' || !recorderState.isRecording || stoppingRef.current) return;
      setInterrupted(true);
      stoppingRef.current = true;
      void recorder
        .stop()
        .then(() => setInterruptedUri(recorder.uri))
        .catch(() => undefined)
        .finally(() => {
          stoppingRef.current = false;
        });
    });
    return () => subscription.remove();
  }, [recorder, recorderState.isRecording]);

  return {
    recorderState,
    interrupted,
    interruptedUri,
    requestPermission,
    startRecording,
    stopRecording,
  };
}
