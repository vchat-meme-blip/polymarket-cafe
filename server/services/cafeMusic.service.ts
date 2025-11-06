/// <reference types="node" />

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { elevenLabsService } from './elevenlabs.service.js';

type CachedTrack = {
  buffer: Buffer;
  prompt: string;
  createdAt: number;
  lastUsed: number;
  useCount: number;
  expiresAt: number;
  id: string; // Unique ID for each track
};

const TRACK_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_POOL_SIZE = 10; // Maximum number of tracks to keep in the pool
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
  private trackPool = new Map<string, CachedTrack>();
  private roomAssignments = new Map<string, string>(); // roomId -> trackId
  private inflightGenerations = new Map<string, Promise<CachedTrack>>();

  private async generateNewTrack(): Promise<CachedTrack> {
    const prompt = randomPrompt();
    const musicStream = await elevenLabsService.composeMusic({
      prompt,
      musicLengthMs: DEFAULT_TRACK_LENGTH_MS,
    });
    
    const buffer = await streamToBuffer(musicStream);
    const now = Date.now();
    const trackId = Math.random().toString(36).substring(2, 10);
    
    return {
      id: trackId,
      buffer,
      prompt,
      createdAt: now,
      lastUsed: now,
      useCount: 0,
      expiresAt: now + TRACK_TTL_MS
    };
  }

  private cleanupExpiredTracks(): void {
    const now = Date.now();
    for (const [id, track] of this.trackPool.entries()) {
      if (track.expiresAt <= now) {
        this.trackPool.delete(id);
        // Remove any room assignments for this track
        for (const [roomId, trackId] of this.roomAssignments.entries()) {
          if (trackId === id) {
            this.roomAssignments.delete(roomId);
          }
        }
      }
    }
  }

  private getLeastUsedTrack(): CachedTrack | undefined {
    let leastUsed: CachedTrack | undefined;
    let minUses = Infinity;
    let oldestTimestamp = Date.now();

    for (const track of this.trackPool.values()) {
      if (track.useCount < minUses || 
          (track.useCount === minUses && track.lastUsed < oldestTimestamp)) {
        leastUsed = track;
        minUses = track.useCount;
        oldestTimestamp = track.lastUsed;
      }
    }
    return leastUsed;
  }

  public async getTrack(roomId: string, options: { forceRefresh?: boolean } = {}): Promise<{ buffer: Buffer; prompt: string; trackId: string }> {
    if (!elevenLabsService.isConfigured()) {
      throw new Error('ElevenLabs service is not configured');
    }

    const { forceRefresh = false } = options;
    const now = Date.now();

    // Clean up expired tracks
    this.cleanupExpiredTracks();

    // If pool is full and we need to generate a new track, remove least used one
    if (this.trackPool.size >= MAX_POOL_SIZE && !this.trackPool.has(this.roomAssignments.get(roomId) || '')) {
      const trackToRemove = this.getLeastUsedTrack();
      if (trackToRemove) {
        this.trackPool.delete(trackToRemove.id);
        // Remove room assignments for this track
        for (const [rId, tId] of this.roomAssignments.entries()) {
          if (tId === trackToRemove.id) {
            this.roomAssignments.delete(rId);
          }
        }
      }
    }

    // Check if room already has an assigned track that's still valid
    const currentTrackId = this.roomAssignments.get(roomId);
    if (!forceRefresh && currentTrackId) {
      const currentTrack = this.trackPool.get(currentTrackId);
      if (currentTrack && currentTrack.expiresAt > now) {
        // Update track metadata
        currentTrack.lastUsed = now;
        currentTrack.useCount += 1;
        return {
          buffer: currentTrack.buffer,
          prompt: currentTrack.prompt,
          trackId: currentTrack.id
        };
      }
    }

    // Find an existing track that's not expired
    for (const track of this.trackPool.values()) {
      if (track.expiresAt > now) {
        // Update track metadata
        track.lastUsed = now;
        track.useCount += 1;
        this.roomAssignments.set(roomId, track.id);
        return {
          buffer: track.buffer,
          prompt: track.prompt,
          trackId: track.id
        };
      }
    }

    // Generate a new track if none available
    try {
      const generationKey = 'new-track';
      let promise = this.inflightGenerations.get(generationKey);
      
      if (!promise) {
        promise = this.generateNewTrack();
        this.inflightGenerations.set(generationKey, promise);
      }

      const newTrack = await promise;
      
      // Only add to pool if we're still under the limit (could have been added by another request)
      if (this.trackPool.size < MAX_POOL_SIZE || this.trackPool.has(newTrack.id)) {
        this.trackPool.set(newTrack.id, newTrack);
      }
      
      this.roomAssignments.set(roomId, newTrack.id);
      
      return {
        buffer: newTrack.buffer,
        prompt: newTrack.prompt,
        trackId: newTrack.id
      };
    } finally {
      this.inflightGenerations.delete('new-track');
    }
  }
}

export const cafeMusicService = new CafeMusicService();
