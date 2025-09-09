/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { VoiceID, AVAILABLE_VOICES } from '../presets/agents';
import { audioContext as getAudioContext } from '../utils';

class TextToSpeechService {
    private audioContext: AudioContext | null = null;
    private audioCache = new Map<string, AudioBuffer>();

    private async initializeContext() {
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = await getAudioContext();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    public async synthesize(text: string, voiceId: VoiceID): Promise<AudioBuffer | null> {
        await this.initializeContext();
        if (!this.audioContext) return null;

        const cacheKey = `${voiceId}:${text}`;
        if (this.audioCache.has(cacheKey)) {
            return this.audioCache.get(cacheKey)!;
        }
        
        const voiceProfile = AVAILABLE_VOICES.find(v => v.id === voiceId);
        const langCode = voiceProfile ? voiceProfile.lang : 'en-US'; // Default to en-US if not found

                const encodedText = encodeURIComponent(text);
        const encodedLang = encodeURIComponent(langCode);
        const url = `/api/tts?text=${encodedText}&voice=${encodedLang}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`TTS service failed with status ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Cache the successfully decoded buffer
            this.audioCache.set(cacheKey, audioBuffer);
            
            return audioBuffer;
        } catch (error) {
            console.error('Error synthesizing speech:', error);
            return null;
        }
    }

    public play(audioBuffer: AudioBuffer): AudioBufferSourceNode | null {
        if (!this.audioContext) return null;
        
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        source.start(0);
        return source;
    }
}

export const ttsService = new TextToSpeechService();