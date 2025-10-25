/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceID } from '../../lib/presets/agents';
// FIX: Fix import for `useAgent` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useAgent } from '../../lib/state/index.js';
import { useArenaStore } from '../../lib/state/arena';
import { ttsService } from '../../lib/services/tts.service';

type Utterance = {
  text: string;
  voice: VoiceID;
};

/**
 * Plays live conversation audio for the active room while guarding against
 * infinite render loops and overlapping playback.
 */
export const useLiveConversationSynthesis = (roomId: string | null) => {
  const [isMuted, setIsMutedState] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const queueRef = useRef<Utterance[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const processingRef = useRef(false);
  const mutedRef = useRef(false);
  const lastSpokenIndexRef = useRef(-1);

  const allAgents = useMemo(
    () => [
      ...useAgent.getState().availablePersonal,
      ...useAgent.getState().availablePresets
    ],
    []
  );

  const stopCurrentPlayback = useCallback(() => {
    const source = currentSourceRef.current;
    if (!source) return;

    source.onended = null;
    try {
      ttsService.stop(source);
    } catch (error) {
      console.warn('[LiveSynthesis] Failed to stop current source:', error);
    }
    currentSourceRef.current = null;
  }, []);

  const drainQueue = useCallback(async function drainQueueInner() {
    if (processingRef.current || mutedRef.current || queueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    setIsSpeaking(true);

    try {
      while (!mutedRef.current && queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        if (!next) break;

        try {
          const buffer = await ttsService.synthesize({ text: next.text, voiceId: next.voice });
          if (!buffer || mutedRef.current) {
            continue;
          }

          const source = ttsService.play(buffer);
          if (!source) {
            continue;
          }

          currentSourceRef.current = source;

          await new Promise<void>((resolve) => {
            source.onended = () => {
              source.onended = null;
              if (currentSourceRef.current === source) {
                currentSourceRef.current = null;
              }
              resolve();
            };
          });
        } catch (error) {
          console.error('[LiveSynthesis] Failed to synthesize message:', error);
        }
      }
    } finally {
      if (mutedRef.current) {
        stopCurrentPlayback();
      }

      if (queueRef.current.length === 0 || mutedRef.current) {
        setIsSpeaking(false);
      }

      processingRef.current = false;

      if (!mutedRef.current && queueRef.current.length > 0) {
        queueMicrotask(() => {
          if (!processingRef.current && !mutedRef.current) {
            void drainQueueInner();
          }
        });
      }
    }
  }, [stopCurrentPlayback]);

  const setMutedState = useCallback((mute: boolean) => {
    setIsMutedState(mute);
    mutedRef.current = mute;

    if (mute) {
      queueRef.current = [];
      processingRef.current = false;
      stopCurrentPlayback();
      setIsSpeaking(false);

      try {
        if (typeof window !== 'undefined') {
          window.speechSynthesis?.cancel?.();
        }
      } catch (error) {
        // ignore browsers without speech synthesis
      }
    } else if (queueRef.current.length > 0) {
      void drainQueue();
    }
  }, [drainQueue, stopCurrentPlayback]);

  useEffect(() => {
    if (!roomId) {
      setMutedState(true);
      queueRef.current = [];
      lastSpokenIndexRef.current = -1;
      return;
    }

    queueRef.current = [];
    lastSpokenIndexRef.current = -1;

    const unsubscribe = useArenaStore.subscribe(
      (state) => {
        const room = state.rooms.find(r => r.id === roomId);
        if (!room || room.agentIds.length < 2) {
          return [];
        }
        const [agent1, agent2] = room.agentIds;
        return state.agentConversations[agent1]?.[agent2] || [];
      },
      (conversation) => {
        if (!Array.isArray(conversation) || conversation.length === 0) {
          lastSpokenIndexRef.current = conversation.length - 1;
          return;
        }

        // Skip initial backlog playback when the listener first attaches
        if (lastSpokenIndexRef.current === -1) {
          lastSpokenIndexRef.current = conversation.length - 1;
          return;
        }

        // Handle history truncation (store only latest 50 turns)
        const totalMessages = conversation.length;
        const previousIndex = lastSpokenIndexRef.current;

        // If history shrank behind our pointer, re-align to newest message
        if (previousIndex >= totalMessages) {
          lastSpokenIndexRef.current = totalMessages - 1;
          return;
        }

        const recentWindowStart = Math.max(totalMessages - 5, 0);
        let startIndex = previousIndex + 1;
        if (startIndex < recentWindowStart) {
          startIndex = recentWindowStart;
        }

        if (startIndex >= totalMessages) {
          lastSpokenIndexRef.current = totalMessages - 1;
          return;
        }

        const pending = conversation.slice(startIndex);
        if (pending.length === 0) {
          lastSpokenIndexRef.current = totalMessages - 1;
          return;
        }

        for (const message of pending) {
          const agent = allAgents.find(a => a.id === message.agentId);
          if (!agent) continue;
          queueRef.current.push({ text: message.text, voice: agent.voice });
        }

        lastSpokenIndexRef.current = conversation.length - 1;

        if (!mutedRef.current) {
          void drainQueue();
        }
      },
      { fireImmediately: true }
    );

    return () => {
      unsubscribe();
      setMutedState(true);
      queueRef.current = [];
      lastSpokenIndexRef.current = -1;
    };
  }, [roomId, allAgents, drainQueue, setMutedState]);

  return { isMuted, setIsMuted: setMutedState, isSpeaking };
};