/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { VoiceID } from '../../lib/presets/agents';
import { useAgent } from '../../lib/state';
import { useArenaStore } from '../../lib/state/arena';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ttsService } from '../../lib/services/tts.service';

/**
 * A hook that listens to the active conversation in a specific room
 * and plays it back live using a high-quality, external TTS engine.
 */
export const useLiveConversationSynthesis = (
  roomId: string | null,
) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceQueueRef = useRef<{ text: string; voice: VoiceID }[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const allAgents = useMemo(() => [
    ...useAgent.getState().availablePresets,
    ...useAgent.getState().availablePersonal
  ], []);

  const lastSpokenIndexRef = useRef<number>(-1);

  const processQueue = useCallback(async () => {
    if (isMuted || isSpeaking || utteranceQueueRef.current.length === 0) {
      return;
    }
    
    setIsSpeaking(true);
    const { text, voice } = utteranceQueueRef.current.shift()!;
    
    const audioBuffer = await ttsService.synthesize(text, voice);
    
    // Check mute status again after async operation
    if (audioBuffer && !isMuted) {
      const source = ttsService.play(audioBuffer);
      if (source) {
        currentSourceRef.current = source;
        source.onended = () => {
          currentSourceRef.current = null;
          setIsSpeaking(false);
          // Use a timeout to prevent potential recursion depth issues
          setTimeout(processQueue, 0); 
        };
      } else {
        // If playback fails, try next item in queue
        setIsSpeaking(false);
        setTimeout(processQueue, 0);
      }
    } else {
      // If no buffer or muted, try next item in queue
      setIsSpeaking(false);
      setTimeout(processQueue, 0);
    }
  }, [isMuted, isSpeaking]);

  const setMutedState = useCallback((mute: boolean) => {
    setIsMuted(mute);
    if (mute) {
      utteranceQueueRef.current = [];
      if (currentSourceRef.current) {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
        currentSourceRef.current = null;
      }
      setIsSpeaking(false);
    }
  }, []);

  useEffect(() => {
    if (!roomId) {
      setMutedState(true); // Stop and clear queue if no room is selected
      return;
    }

    // Reset for new room
    lastSpokenIndexRef.current = -1;
    setMutedState(isMuted);

    const unsubscribe = useArenaStore.subscribe(
      state => {
        const room = state.rooms.find(r => r.id === roomId);
        if (!room || room.agentIds.length < 2) return [];
        const [agent1Id, agent2Id] = room.agentIds;
        return state.agentConversations[agent1Id]?.[agent2Id] || [];
      },
      (conversation) => {
        if (isMuted || !conversation) return;
        
        const newMessages = conversation.slice(lastSpokenIndexRef.current + 1);

        if (newMessages.length > 0) {
          for (const message of newMessages) {
            const agent = allAgents.find(a => a.id === message.agentId);
            if (!agent) continue;
            
            utteranceQueueRef.current.push({ text: message.text, voice: agent.voice });
          }
          lastSpokenIndexRef.current = conversation.length - 1;
          processQueue();
        }
      },
      { fireImmediately: true },
    );

    return () => {
      unsubscribe();
      setMutedState(true); // Cleanup on unmount
    };
  }, [roomId, allAgents, processQueue, isMuted, setMutedState]);

  return { isMuted, setIsMuted: setMutedState };
};