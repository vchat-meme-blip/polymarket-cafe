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
        try {
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = await getAudioContext();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            return true;
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            return false;
        }
    }

    public async synthesize(text: string, voiceId: VoiceID): Promise<AudioBuffer | null> {
        if (!text?.trim()) return null;
        
        const isInitialized = await this.initializeContext();
        if (!isInitialized || !this.audioContext) {
            console.error('Audio context not available');
            return null;
        }

        const cacheKey = `${voiceId}:${text}`;
        const cachedBuffer = this.audioCache.get(cacheKey);
        if (cachedBuffer) {
            return cachedBuffer;
        }
        
        const voiceProfile = AVAILABLE_VOICES.find(v => v.id === voiceId);
        const langCode = voiceProfile ? voiceProfile.lang : 'en-US';

        try {
            const encodedText = encodeURIComponent(text);
            const encodedLang = encodeURIComponent(langCode);
            const url = `/api/tts?text=${encodedText}&voice=${encodedLang}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`TTS service failed with status ${response.status}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                throw new Error('Empty audio data received');
            }
            
            // Add error handling for decodeAudioData
            const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
                this.audioContext!.decodeAudioData(
                    arrayBuffer,
                    (buffer) => resolve(buffer),
                    (error) => {
                        console.error('Failed to decode audio data:', error);
                        reject(error);
                    }
                );
            });
            
            if (audioBuffer) {
                this.audioCache.set(cacheKey, audioBuffer);
                return audioBuffer;
            }
            return null;
        } catch (error) {
            console.error('Error in TTS synthesis:', error);
            return null;
        }
    }

    public play(audioBuffer: AudioBuffer): AudioBufferSourceNode | null {
        try {
            if (!this.audioContext || !audioBuffer) {
                console.error('Audio context or buffer not available');
                return null;
            }
            
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            // Add error handling using the correct event listener pattern
            const handleError = (event: ErrorEvent) => {
                console.error('Error during audio playback:', event.error);
                source.removeEventListener('error', handleError);
                source.disconnect();
            };
            source.addEventListener('error', handleError);
            
            source.start(0);
            return source;
        } catch (error) {
            console.error('Failed to play audio:', error);
            return null;
        }
    }
}

export const ttsService = new TextToSpeechService();