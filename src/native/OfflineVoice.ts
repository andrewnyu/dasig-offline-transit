import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

interface OfflineVoiceModule {
  isAvailable(): Promise<boolean>;
  start(locale: string): Promise<void>;
  stop(): Promise<void>;
  speak(text: string, locale: string): Promise<void>;
}

const nativeModule = NativeModules.OfflineVoice as OfflineVoiceModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(NativeModules.OfflineVoice) : null;

export async function offlineVoiceAvailable(): Promise<boolean> {
  return nativeModule ? nativeModule.isAvailable() : false;
}

export async function requestMicrophone(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Use offline voice directions',
      message: 'DASIG listens only while voice capture is active. Audio stays on this device.',
      buttonPositive: 'Allow microphone',
      buttonNegative: 'Not now',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function startListening(
  onResult: (transcript: string) => void,
  onError: (message: string) => void,
): Promise<() => void> {
  if (!nativeModule || !emitter) {
    throw new Error('On-device speech recognition is unavailable on this device.');
  }
  const allowed = await requestMicrophone();
  if (!allowed) {
    throw new Error('Microphone permission is required for voice directions.');
  }
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    result.remove();
    failure.remove();
    void nativeModule.stop();
  };
  const result = emitter.addListener('offlineVoiceResult', event => {
    const transcript = String(event.transcript ?? '');
    cleanup();
    onResult(transcript);
  });
  const failure = emitter.addListener('offlineVoiceError', event => {
    const message = String(event.message ?? 'Voice recognition stopped.');
    cleanup();
    onError(message);
  });
  await nativeModule.start('en-PH');
  return cleanup;
}

export async function speakOffline(text: string): Promise<void> {
  if (!nativeModule) {
    throw new Error('Offline text-to-speech is unavailable on this device.');
  }
  await nativeModule.speak(text, 'en-PH');
}
