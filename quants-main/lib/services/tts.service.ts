/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { audioContext as getAudioContext } from '../utils';
import { API_BASE_URL } from '../config';

export type ElevenLabsVoice = {
  id: string;
  label: string;
};

const VOICE_ALIASES: Record<string, string> = {
  'en-US-1': '21m00Tcm4TlvDq8ikWAM', // Former label-based identifier -> Rachel
  'en-US-2': 'AZnzlk1XvdvUeBnXmlld',
  'en-US-3': 'EXAVITQu4vr4xnSDxMaL',
  'en-US-4': 'ErXwobaYiN019PkySvjV',
  'en-GB-1': 'ErXwobaYiN019PkySvjV',
  'en-GB-2': 'MF3mGyEYCl7XYWbV9V6O',
  'en-GB-3': 'VR6AewLTigWG4xSOukaG',
  'en-AU-1': 'yoZ06aMxZJJ28mfd3POQ',
  'en-AU-2': 'pNInz6obpgDQGcFmaJgB',
};

type SynthesisOptions = {
  text: string;
  voiceId?: string;
  modelId?: string;
};

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const VOICE_REFRESH_MS = 5 * 60 * 1000;

class ElevenLabsTextToSpeechService {
  private audioContext: AudioContext | null = null;
  private audioCache = new Map<string, AudioBuffer>();
  private voiceCache: { voices: ElevenLabsVoice[]; fetchedAt: number } | null = null;
  private inflightSyntheses = new Map<string, Promise<AudioBuffer | null>>();

  private async ensureContext(): Promise<AudioContext | null> {
    try {
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = await getAudioContext();
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return this.audioContext;
    } catch (error) {
      console.error('[ttsService] Failed to initialize audio context:', error);
      return null;
    }
  }

  private async fetchVoicesFromServer(): Promise<ElevenLabsVoice[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tts-voices`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Voice fetch failed with status ${response.status}`);
      }
      const data = await response.json();
      const voices: ElevenLabsVoice[] = Array.isArray(data?.voices)
        ? data.voices.map((voice: any) => ({
            id: voice.value ?? voice.id ?? DEFAULT_VOICE_ID,
            label: voice.label ?? voice.name ?? 'Voice'
          }))
        : [];
      return voices.length > 0 ? voices : [{ id: DEFAULT_VOICE_ID, label: 'Default' }];
    } catch (error) {
      console.error('[ttsService] Failed to load voices:', error);
      return [{ id: DEFAULT_VOICE_ID, label: 'Default' }];
    }
  }

  public async getAvailableVoices(forceRefresh = false): Promise<ElevenLabsVoice[]> {
    const now = Date.now();
    if (!forceRefresh && this.voiceCache && now - this.voiceCache.fetchedAt < VOICE_REFRESH_MS) {
      return this.voiceCache.voices;
    }

    const voices = await this.fetchVoicesFromServer();
    this.voiceCache = { voices, fetchedAt: now };
    return voices;
  }

  public async synthesize(options: SynthesisOptions): Promise<AudioBuffer | null> {
    const { text, voiceId, modelId } = options;
    if (!text?.trim()) return null;

    const context = await this.ensureContext();
    if (!context) return null;

    const cacheKey = `${voiceId || DEFAULT_VOICE_ID}:${modelId || 'default'}:${text}`;
    if (this.audioCache.has(cacheKey)) {
      return this.audioCache.get(cacheKey) ?? null;
    }

    if (this.inflightSyntheses.has(cacheKey)) {
      return this.inflightSyntheses.get(cacheKey)!;
    }

    const synthesisPromise = this.fetchAndDecodeAudio(cacheKey, context, options).finally(() => {
      this.inflightSyntheses.delete(cacheKey);
    });

    this.inflightSyntheses.set(cacheKey, synthesisPromise);
    return synthesisPromise;
  }

  private async fetchAndDecodeAudio(
    cacheKey: string,
    context: AudioContext,
    options: SynthesisOptions
  ): Promise<AudioBuffer | null> {
    try {
      const normalizedVoiceId = this.normalizeVoiceId(options.voiceId);

      const response = await fetch(`${API_BASE_URL}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          text: options.text,
          voiceId: normalizedVoiceId,
          modelId: options.modelId
        })
      });

      if (!response.ok) {
        let errorDetails = `status ${response.status}`;
        try {
          const errorJson = await response.json();
          if (errorJson?.error) {
            errorDetails += `: ${errorJson.error}`;
          }
        } catch {
          // ignore JSON parse errors, we already have status
        }
        throw new Error(`TTS request failed with ${errorDetails}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        throw new Error('Empty audio response received');
      }

      const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
      this.audioCache.set(cacheKey, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.error('[ttsService] Failed to synthesize audio:', error);
      return null;
    }
  }

  public play(buffer: AudioBuffer): AudioBufferSourceNode | null {
    if (!buffer) return null;

    const context = this.audioContext;
    if (!context) {
      console.error('[ttsService] Audio context not initialized');
      return null;
    }

    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
      return source;
    } catch (error) {
      console.error('[ttsService] Failed to play audio buffer:', error);
      return null;
    }
  }

  public stop(source: AudioBufferSourceNode | null) {
    if (!source) return;
    try {
      source.stop();
      source.disconnect();
    } catch (error) {
      console.error('[ttsService] Failed to stop audio source:', error);
    }
  }

  private normalizeVoiceId(voiceId?: string): string {
    if (!voiceId) {
      return DEFAULT_VOICE_ID;
    }

    if (VOICE_ALIASES[voiceId]) {
      return VOICE_ALIASES[voiceId];
    }

    if (/^[a-z]{2}-[A-Z]{2}-\d+$/.test(voiceId)) {
      console.warn(`[ttsService] Unknown locale voice alias "${voiceId}". Falling back to default ElevenLabs voice.`);
      return DEFAULT_VOICE_ID;
    }

    return voiceId;
  }
}

export const ttsService = new ElevenLabsTextToSpeechService();