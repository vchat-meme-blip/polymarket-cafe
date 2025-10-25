import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

type SpeechOptions = {
  text: string;
  voiceId?: string;
  modelId?: string;
};

type MusicOptions = {
  prompt: string;
  musicLengthMs?: number;
};

const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_TTS_MODEL_ID = process.env.ELEVENLABS_TTS_MODEL_ID || 'eleven_multilingual_v2';

const DEFAULT_MUSIC_LENGTH = Number.parseInt(process.env.ELEVENLABS_DEFAULT_MUSIC_MS || '', 10) || 60_000;

const STATIC_VOICES = [
  { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel' },
  { value: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi' },
  { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella' },
  { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni' },
  { value: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli' },
  { value: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh' },
  { value: 'VR6AewLTigWG4xSOukaG', label: 'Arnold' },
  { value: 'pNInz6obpgDQGcFmaJgB', label: 'Adam' },
  { value: 'yoZ06aMxZJJ28mfd3POQ', label: 'Sam' }
] as const;

class ElevenLabsService {
  private client: ElevenLabsClient | null = null;

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (apiKey) {
      this.client = new ElevenLabsClient({ apiKey });
      console.log('[ElevenLabsService] Client initialized.');
    } else {
      console.warn('[ElevenLabsService] ELEVENLABS_API_KEY not found. Voice features are disabled.');
    }
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  public getDefaultVoiceId(): string {
    return DEFAULT_VOICE_ID;
  }

  public getAvailableVoices() {
    return {
      voices: STATIC_VOICES,
      lastLoaded: Date.now()
    };
  }

  public async synthesizeSpeech(options: SpeechOptions): Promise<ReadableStream<Uint8Array>> {
    if (!this.client) {
      throw new Error('ElevenLabs client is not configured.');
    }

    const { text, voiceId, modelId } = options;
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for TTS synthesis.');
    }

    const id = voiceId || DEFAULT_VOICE_ID;
    const selectedModel = modelId || DEFAULT_TTS_MODEL_ID;

    return this.client.textToSpeech.convert(id, {
      text,
      modelId: selectedModel
    });
  }

  public async composeMusic(options: MusicOptions): Promise<ReadableStream<Uint8Array>> {
    if (!this.client) {
      throw new Error('ElevenLabs client is not configured.');
    }

    const { prompt, musicLengthMs } = options;
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('A prompt is required to compose music.');
    }

    const length = musicLengthMs && musicLengthMs > 0 ? musicLengthMs : DEFAULT_MUSIC_LENGTH;

    return this.client.music.compose({
      prompt,
      musicLengthMs: length
    });
  }
}

export const elevenLabsService = new ElevenLabsService();
