/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent } from '../../lib/presets/agents';
import { usePlaybackSynthesis } from '../../hooks/arena/usePlaybackSynthesis';
import { Interaction } from '../../lib/state/arena';
import { useEffect, useState } from 'react';
import styles from './Mail.module.css';

type ConversationDetailProps = {
  conversation: Interaction[];
  allAgents: Agent[];
};

export default function ConversationDetail({
  conversation,
  allAgents,
}: ConversationDetailProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { play, cancel } = usePlaybackSynthesis(conversation, allAgents);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [conversation, cancel]);

  const handlePlay = () => {
    play();
    setIsPlaying(true);
    const interval = setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        setIsPlaying(false);
        clearInterval(interval);
      }
    }, 250);
  };

  const handleCancel = () => {
    cancel();
    setIsPlaying(false);
  };

  if (conversation.length === 0) {
    return (
      <main className={styles.conversationDetail}>
        <div className={styles.emptyConversation}>
          <span className="icon">forum</span>
          <p>Select a conversation to read.</p>
        </div>
      </main>
    );
  }
  return (
    <main className={styles.conversationDetail}>
      <div className={styles.conversationControls}>
        <button className="button" onClick={handlePlay} disabled={isPlaying}>
          <span className="icon">play_circle</span>
          {isPlaying ? 'Playing...' : 'Play Conversation'}
        </button>
        <button className="button" onClick={handleCancel} disabled={!isPlaying}>
          <span className="icon">stop_circle</span>
          Stop
        </button>
      </div>
      <div className="conversation-log">
        <ul>
          {conversation.map((interaction, index) => (
            <li key={index}>
              <p className="log-entry">
                <span
                  className="log-agent-name"
                  style={{ color: 'var(--brand-cyan)' }}
                >
                  {interaction.agentName}:
                </span>{' '}
                {interaction.text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}