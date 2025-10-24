// FIX: This file contained an incorrect mock of TwitterService. It has been replaced with the correct implementation for the ElevenLabs text-to-speech and music generation service.
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

class ElevenLabsService {
  private client: ElevenLabsClient | null = null;

  constructor() {
    if (ELEVENLABS_API_KEY) {
      try {
        this.client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
        console.log('[ElevenLabsService] Initialized successfully.');
      } catch (error) {
        console.error('[ElevenLabsService] Failed to initialize client:', error);
      }
    } else {
      console.warn('[ElevenLabsService] ELEVENLABS_API_KEY is not configured. TTS and music features will be disabled.');
    }
  }

  public isConfigured(): boolean {
    return !!this.client;
  }
  
  public getAvailableVoices() {
    // In a real app, this would fetch voices from the ElevenLabs API.
    // Returning a static list for now to match client-side expectations.
    return [
        { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel' },
        { value: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi' },
        { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella' }
    ];
  }

  public async synthesizeSpeech(options: { text: string; voiceId: string; modelId?: string }): Promise<ReadableStream<Uint8Array>> {
    if (!this.client) {
      throw new Error('ElevenLabsService is not configured. Missing API key.');
    }
    const { text, voiceId, modelId } = options;
    return this.client.textToSpeech.convert(voiceId, { text, modelId });
  }

  public async composeMusic(options: { prompt: string, musicLengthMs?: number }): Promise<ReadableStream<Uint8Array>> {
    if (!this.client) {
      throw new Error('ElevenLabsService is not configured. Missing API key.');
    }
    return this.client.music.compose(options);
  }
}

export const elevenLabsService = new ElevenLabsService();