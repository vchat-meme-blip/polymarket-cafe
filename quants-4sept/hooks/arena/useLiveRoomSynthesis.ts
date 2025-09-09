/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent } from '../../lib/presets/agents';
import { useAgent } from '../../lib/state';
import { useArenaStore } from '../../lib/state/arena';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// A whitelist of known, high-quality voices. This acts as a "Quality Gate".
const VOICE_WHITELIST: Record<string, string[]> = {
  Aoede: ['Samantha', 'Google UK English Female', 'Microsoft Zira - English (United States)', 'Karen'],
  Charon: ['Daniel', 'Google US English', 'Microsoft David - English (United States)', 'Tom'],
  Fenrir: ['Oliver', 'Google UK English Male', 'Microsoft Mark - English (United States)'],
  Kore: ['Victoria', 'Tessa', 'Serena', 'Google US English'],
  Leda: ['Tessa', 'Samantha', 'Serena', 'Google US English'],
  Orus: ['Alex', 'Tom', 'Microsoft Guy - English (United States)', 'Google US English'],
  Puck: ['Fred', 'Aaron', 'Rishi', 'Google US English'],
  Zephyr: ['Rishi', 'Alex', 'Eddy', 'Google US English'],
};

/**
 * A hook that listens to the active conversation in a specific room
 * and plays it back live using the browser's SpeechSynthesis API.
 */
export const useLiveConversationSynthesis = (
  roomId: string | null,
) => {
  const [isMuted, setIsMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const lastSpokenIndexRef = useRef<number>(-1);

  // Get agent data from the store. This is more robust than passing as props.
  const availablePresets = useAgent(state => state.availablePresets);
  const availablePersonal = useAgent(state => state.availablePersonal);
  const allAgents = useMemo(() => [...availablePresets, ...availablePersonal], [availablePresets, availablePersonal]);


  useEffect(() => {
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  const findVoice = useCallback(
    (agentVoiceName: string): SpeechSynthesisVoice | null => {
      if (voices.length === 0) return null;
      const possibleNames = VOICE_WHITELIST[agentVoiceName] || [];
      // Prioritize non-local (cloud-based) voices as they are often higher quality
      for (const name of possibleNames) {
        const found = voices.find(v => v.name === name && !v.localService);
        if (found) return found;
      }
      // Fallback to local high-quality voices if a cloud one isn't found
      for (const name of possibleNames) {
        const found = voices.find(v => v.name === name);
        if (found) return found;
      }
      // If no whitelisted voice is found, return null to enforce the quality gate.
      return null;
    },
    [voices],
  );

  const setMutedState = useCallback((mute: boolean) => {
    if (mute) {
      utteranceQueueRef.current = [];
      window.speechSynthesis.cancel();
    }
    setIsMuted(mute);
  }, []);

  const processQueue = useCallback(() => {
    if (
      isMuted ||
      window.speechSynthesis.speaking ||
      utteranceQueueRef.current.length === 0
    ) {
      return;
    }
    const utterance = utteranceQueueRef.current.shift();
    if (utterance) {
      utterance.onend = processQueue;
      window.speechSynthesis.speak(utterance);
    }
  }, [isMuted]);

  useEffect(() => {
    // If there's no active room, reset everything.
    if (!roomId || voices.length === 0) {
      utteranceQueueRef.current = [];
      window.speechSynthesis.cancel();
      lastSpokenIndexRef.current = -1;
      return;
    }

    // Reset state for the new room.
    lastSpokenIndexRef.current = -1;
    utteranceQueueRef.current = [];
    window.speechSynthesis.cancel();

    const unsubscribe = useArenaStore.subscribe(
      state => {
        const room = state.rooms.find(r => r.id === roomId);
        if (!room || room.agentIds.length < 2) return [];
        const [agent1Id, agent2Id] = room.agentIds;
        return state.agentConversations[agent1Id]?.[agent2Id] || [];
      },
      (conversation) => {
        // Don't process if muted or the conversation is empty.
        if (isMuted || !conversation) return;
        
        // This is the core fix: determine which messages are new.
        const newMessages = conversation.slice(lastSpokenIndexRef.current + 1);

        if (newMessages.length > 0) {
          for (const message of newMessages) {
            const agent = allAgents.find(a => a.id === message.agentId);
            if (!agent) continue;
            
            const voice = findVoice(agent.voice);
            // The Quality Gate: Only speak if a high-quality voice was found.
            if (voice) {
              const utterance = new SpeechSynthesisUtterance(message.text);
              utterance.voice = voice;
              utterance.rate = 1.1;
              utterance.pitch = 1;
              utteranceQueueRef.current.push(utterance);
            }
          }
          // IMPORTANT: Update the index to the end of the current conversation.
          lastSpokenIndexRef.current = conversation.length - 1;
          processQueue();
        }
      },
      { fireImmediately: true },
    );

    return () => {
      unsubscribe();
      window.speechSynthesis.cancel();
    };
  }, [roomId, isMuted, allAgents, voices, findVoice, processQueue]);

  return { isMuted, setIsMuted: setMutedState };
};