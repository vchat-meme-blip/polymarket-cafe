/// <reference types="node" />

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { elevenLabsService } from './elevenlabs.service.js';

export type CafeMusicTrack = {
  buffer: Buffer;
  prompt: string;
  expiresAt: number;
};

const DEFAULT_TRACK_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_TRACK_LENGTH_MS = Number.parseInt(process.env.ELEVENLABS_CAFE_TRACK_LENGTH_MS || '', 10) || 75_000;

const CAFE_MUSIC_PROMPTS: readonly string[] = [
  'Dreamy lo-fi instrumental with gentle coffee shop ambience and soft piano flourishes',
  'Chillhop groove with upright bass, vinyl crackle, and mellow electric piano chords',
  'Laid-back jazz trio with brushed drums, walking bass, and smooth guitar comping',
  'Ambient downtempo track with field recordings of distant chatter and espresso machines',
  'Bossa nova inspired cafe tune with nylon guitar, light percussion, and warm pads',
  'Upbeat nu-jazz instrumental with muted trumpets and cozy lounge vibes',
  'Soft synthwave track evoking twilight in a neon-lit coffee bar',
  'Organic house groove with subtle percussion and relaxing piano motifs',
  'Acoustic chill track with fingerstyle guitar, shakers, and soothing atmospherics',
  'Minimalist piano and lo-fi beats blending into a calm late-night cafe atmosphere'
];

const randomPrompt = () => {
  const index = Math.floor(Math.random() * CAFE_MUSIC_PROMPTS.length);
  return CAFE_MUSIC_PROMPTS[index];
};

const streamToBuffer = async (stream: ReadableStream<Uint8Array>): Promise<Buffer> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
};

class CafeMusicService {
  private cache = new Map<string, CafeMusicTrack>();
  private inflight = new Map<string, Promise<CafeMusicTrack>>();

  private async generateTrack(roomId: string, prompt: string): Promise<CafeMusicTrack> {
    const musicStream = await elevenLabsService.composeMusic({
      prompt,
      musicLengthMs: DEFAULT_TRACK_LENGTH_MS,
    });
    const buffer = await streamToBuffer(musicStream);
    const expiresAt = Date.now() + DEFAULT_TRACK_TTL_MS;
    return { buffer, prompt, expiresAt };
  }

  public async getTrack(roomId: string, options: { forceRefresh?: boolean } = {}): Promise<CafeMusicTrack> {
    if (!elevenLabsService.isConfigured()) {
      throw new Error('ElevenLabs service is not configured');
    }

    const { forceRefresh = false } = options;
    const now = Date.now();
    const cached = this.cache.get(roomId);

    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached;
    }

    if (!forceRefresh) {
      const inflight = this.inflight.get(roomId);
      if (inflight) {
        return inflight;
      }
    }

    const prompt = randomPrompt();
    const promise = this.generateTrack(roomId, prompt);
    this.inflight.set(roomId, promise);

    try {
      const track = await promise;
      this.cache.set(roomId, track);
      return track;
    } finally {
      this.inflight.delete(roomId);
    }
  }
}

export const cafeMusicService = new CafeMusicService();