/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef, useCallback } from 'react';
import { useAgent } from '../lib/state/index.js';
import { useArenaStore, USER_ID } from '../lib/state/arena';
import { ttsService } from '../lib/services/tts.service.js';

function cleanTextForTTS(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links, keeping the text
    .replace(/[*_`#]/g, ''); // Remove markdown formatting characters
}

/**
 * A hook to manage Text-to-Speech (TTS) for the direct chat with the current agent.
 * It listens for new agent messages and plays them as audio.
 */
export function useDirectChatTTS() {
    const { current: currentAgent } = useAgent();
    const audioQueue = useRef<string[]>([]);
    const isPlaying = useRef(false);
    const lastSpokenIndex = useRef(-1);

    const playNextAudio = useCallback(async () => {
        if (isPlaying.current || audioQueue.current.length === 0) {
            return;
        }
        isPlaying.current = true;

        while (audioQueue.current.length > 0) {
            const textToSpeak = audioQueue.current.shift();
            if (!textToSpeak) continue;
            
            try {
                const buffer = await ttsService.synthesize({ text: textToSpeak, voiceId: currentAgent.voice });
                if (buffer) {
                    const source = ttsService.play(buffer);
                    if (source) {
                        await new Promise(resolve => {
                            source.onended = () => resolve(null);
                        });
                    }
                }
            } catch (error) {
                console.error('[useDirectChatTTS] Error playing audio:', error);
            }
        }

        isPlaying.current = false;
    }, [currentAgent.voice]);

    useEffect(() => {
        // Reset last spoken index when agent changes
        lastSpokenIndex.current = -1;
        audioQueue.current = [];
        isPlaying.current = false;

        const unsubscribe = useArenaStore.subscribe(
            state => state.agentConversations[currentAgent.id]?.[USER_ID],
            (conversation) => {
                if (!conversation || conversation.length === 0) {
                    lastSpokenIndex.current = -1;
                    return;
                }
                
                // On first load of a conversation, set index to the end to prevent playing old messages.
                if (lastSpokenIndex.current === -1) {
                    lastSpokenIndex.current = conversation.length - 1;
                    return;
                }

                const newMessages = conversation.slice(lastSpokenIndex.current + 1);
                const agentMessagesToSpeak = newMessages.filter(msg => msg.agentId !== USER_ID && msg.text);

                if (agentMessagesToSpeak.length > 0) {
                    agentMessagesToSpeak.forEach(msg => {
                        if (!currentAgent.voice) {
                            console.warn(`Agent ${currentAgent.name} has no voice configured. Skipping TTS.`);
                            return;
                        }
                        const cleanedText = cleanTextForTTS(msg.text);
                        if (cleanedText) {
                            audioQueue.current.push(cleanedText);
                        }
                    });
                    
                    if (!isPlaying.current) {
                        playNextAudio();
                    }
                }
                
                lastSpokenIndex.current = conversation.length - 1;
            }
        );

        return () => {
            unsubscribe();
            // Optional: stop any ongoing playback when component unmounts or agent changes
            // ttsService.stop(null) could be implemented if needed.
        };
    }, [currentAgent.id, currentAgent.name, currentAgent.voice, playNextAudio]);
}