/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Fix imports for `useAgent` and `useUI` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useAgent, useUI } from '../../lib/state/index.js';
import { useArenaStore } from '../../lib/state/arena';
import Modal from '../Modal';
import { Agent } from '../../lib/types/index.js';
import { useMemo, useCallback } from 'react';
import { useLiveConversationSynthesis } from '../../hooks/arena/useLiveRoomSynthesis';
import LiveAudioToggle from './LiveAudioToggle';
import { usePlaybackSynthesis } from '../../hooks/arena/usePlaybackSynthesis';
import styles from '../modals/Modals.module.css';

function getAgentById(id: string, allAgents: Agent[]): Agent | undefined {
  return allAgents.find(agent => agent.id === id);
}

export default function ListenInModal() {
  const { listeningOnRoomId, closeListenInModal } = useUI();
  const allAgents = [
    ...useAgent.getState().availablePresets,
    ...useAgent.getState().availablePersonal,
  ];

  const { rooms, agentConversations } = useArenaStore();
  const { isMuted, setIsMuted } = useLiveConversationSynthesis(listeningOnRoomId);
  const { play, cancel, isPlaying } = usePlaybackSynthesis([], allAgents);

  const conversation = useMemo(() => {
    if (!listeningOnRoomId) return [];
    const room = rooms.find(r => r.id === listeningOnRoomId);
    if (!room || room.agentIds.length < 2) return [];

    const [agent1Id, agent2Id] = room.agentIds;
    return agentConversations[agent1Id]?.[agent2Id] || [];
  }, [listeningOnRoomId, rooms, agentConversations]);

  // Handle modal close with cleanup
  const handleClose = useCallback(() => {
    cancel(); // Stop any ongoing playback
    setIsMuted(true); // Mute live audio
    closeListenInModal();
  }, [cancel, closeListenInModal, setIsMuted]);

  const handlePlayHistory = useCallback(() => {
    // Ensure live audio is muted before playing history to prevent overlap
    if (!isMuted) {
      setIsMuted(true);
    }
    play();
  }, [isMuted, play, setIsMuted]);

  const handleToggleLiveAudio = useCallback(() => {
    // If history is playing, stop it before unmuting live audio
    if (isPlaying) {
      cancel();
    }
    setIsMuted(!isMuted);
  }, [isPlaying, isMuted, cancel, setIsMuted]);

  if (!listeningOnRoomId) return null;

  return (
    <Modal onClose={handleClose}>
      <div className={`${styles.listenInModal} ${styles.modalContentPane}`}>
        <div className={styles.listenInModalHeader}>
            <h2>Room {listeningOnRoomId.split('-')[1]}</h2>
            <div className={styles.controls}>
                <button className="button" onClick={handlePlayHistory} disabled={isPlaying}>
                    <span className="icon">play_circle</span> {isPlaying ? 'Playing...' : 'Play History'}
                </button>
                 <button className="button" onClick={cancel}>
                    <span className="icon">stop_circle</span> Stop
                </button>
                <LiveAudioToggle isMuted={isMuted} onToggle={handleToggleLiveAudio} />
            </div>
        </div>
        <div className={styles.conversationLog}>
          {conversation.length === 0 ? (
            <p className={styles.emptyLog}>No conversation yet. Give it a moment!</p>
          ) : (
            <ul>
              {conversation.map((interaction, index) => (
                <li key={index}>
                  <p className={styles.logEntry}>
                    <span
                      className={styles.logAgentName}
                      style={{ color: 'var(--brand-cyan)' }}
                    >
                      {interaction.agentName}:
                    </span>{' '}
                    {interaction.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}