/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent } from '../../lib/types/index.js';
// FIX: The `Interaction` type is defined in `lib/types` and should be imported from there directly, not from the state store module.
import { Interaction } from '../../lib/types/index.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ttsService } from '../../lib/services/tts.service';

export const usePlaybackSynthesis = (
  interactions: Interaction[],
  allAgents: Agent[],
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const processQueue = useCallback(() => {
    if (audioQueueRef.current.length > 0) {
      const nextBuffer = audioQueueRef.current.shift()!;
      const source = ttsService.play(nextBuffer);
      if (source) {
        currentSourceRef.current = source;
        source.onended = () => {
          currentSourceRef.current = null;
          processQueue();
        };
      }
    } else {
      setIsPlaying(false);
    }
  }, []);

  const playAll = useCallback(async () => {
    if (isPlaying || interactions.length === 0) {
      return;
    }

    setIsPlaying(true);
    audioQueueRef.current = []; // Clear queue
    
    // Fetch and decode all audio buffers in parallel
    const bufferPromises = interactions.map(interaction => {
      const agent = allAgents.find(a => a.id === interaction.agentId);
      if (!agent) return Promise.resolve(null);
      return ttsService.synthesize(interaction.text, agent.voice);
    });

    const buffers = await Promise.all(bufferPromises);
    audioQueueRef.current = buffers.filter((b): b is AudioBuffer => b !== null);
    
    // Start playing the queue
    processQueue();

  }, [interactions, allAgents, processQueue, isPlaying]);

  const cancel = useCallback(() => {
    setIsPlaying(false);
    audioQueueRef.current = [];
    if (currentSourceRef.current) {
      currentSourceRef.current.onended = null; // Prevent onended from firing
      currentSourceRef.current.stop();
      currentSourceRef.current = null;
    }
  }, []);

  // Cleanup effect
    useEffect(() => {
    // This effect should only run on mount and unmount.
    // It ensures that any ongoing playback is stopped when the component is removed.
    return cancel;
  }, [cancel]);

  return { play: playAll, cancel, isPlaying };
};