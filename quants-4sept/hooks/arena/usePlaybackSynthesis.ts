/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent } from '../../lib/presets/agents';
import { Interaction } from '../../lib/state/arena';
import { useCallback, useEffect, useRef, useState } from 'react';

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

export const usePlaybackSynthesis = (
  interactions: Interaction[],
  allAgents: Agent[],
) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

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

  const processQueue = useCallback(() => {
    if (utteranceQueueRef.current.length > 0 && !window.speechSynthesis.speaking) {
      const utterance = utteranceQueueRef.current.shift();
      if (utterance) {
        utterance.onend = () => {
          processQueue();
        };
        window.speechSynthesis.speak(utterance);
      }
    } else if (utteranceQueueRef.current.length === 0 && window.speechSynthesis.speaking === false) {
      setIsPlaying(false);
    }
  }, []);

  const playAll = useCallback(() => {
      if (isPlaying || voices.length === 0 || interactions.length === 0) {
        return;
      }
      
      window.speechSynthesis.cancel();
      setIsPlaying(true);
      utteranceQueueRef.current = [];
      
      for (const interaction of interactions) {
        const agent = allAgents.find(a => a.id === interaction.agentId);
        if (!agent) continue;
        
        const voice = findVoice(agent.voice);
        // The Quality Gate: Only queue the utterance if a high-quality voice was found.
        if (voice) {
            const utterance = new SpeechSynthesisUtterance(interaction.text);
            utterance.voice = voice;
            utterance.rate = 1.1;
            utterance.pitch = 1;
            utteranceQueueRef.current.push(utterance);
        }
      }
      
      processQueue();

  }, [interactions, allAgents, voices, findVoice, processQueue, isPlaying]);

  const cancel = useCallback(() => {
    setIsPlaying(false);
    utteranceQueueRef.current = [];
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
      return cancel;
  }, [interactions, cancel]);


  return { play: playAll, cancel, isPlaying };
};