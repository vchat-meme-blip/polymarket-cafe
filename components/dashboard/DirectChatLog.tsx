/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent, useUI, useUser } from '../../lib/state';
import { USER_ID, useArenaStore } from '../../lib/state/arena';
import c from 'classnames';
import { format } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';
import TokenSummaryCard from './TokenSummaryCard';
import styles from './Dashboard.module.css';

/**
 * A component that displays the live, persisted chat history
 * between the user and their current agent as floating chat bubbles.
 */
export default function DirectChatLog() {
  const { current: currentAgent } = useAgent();
  const { name: userName } = useUser();
  const { agentConversations } = useArenaStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { chatContextToken } = useUI();

  const conversationHistory = useMemo(() => {
    return agentConversations[currentAgent.id]?.[USER_ID] || [];
  }, [agentConversations, currentAgent.id]);

  useEffect(() => {
    // Automatically scroll to the bottom of the chat log on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationHistory, chatContextToken]);

  return (
    <div className={styles.directChatLogContainerFloating}>
      <div className={styles.directChatLogFloating} ref={scrollRef}>
        {conversationHistory.length === 0 ? (
          <div className={styles.floatingEmptyChatLog}>
            <p>Your direct chat with {currentAgent.name} will appear here.</p>
          </div>
        ) : (
          conversationHistory.map((msg, index) => {
            const isLastMessage = index === conversationHistory.length - 1;
            const isAgentMessage = msg.agentId !== USER_ID;

            return (
              <div
                key={index}
                className={c(styles.chatMessageFloating, {
                  [styles.user]: msg.agentId === USER_ID,
                  [styles.agent]: isAgentMessage,
                })}
                aria-label={`Message from ${msg.agentName} at ${format(
                  msg.timestamp,
                  'p',
                )}`}
              >
                <div className={styles.floatingMessageAvatar}>
                  <span className="material-symbols-outlined">
                    {msg.agentId === USER_ID ? 'person' : 'smart_toy'}
                  </span>
                </div>
                <div className={styles.floatingMessageContent}>
                  <div className={styles.floatingMessageHeader}>
                    <span className={styles.floatingMessageName}>{msg.agentName}</span>
                    <span className={styles.floatingMessageTime}>{format(msg.timestamp, 'p')}</span>
                  </div>
                  <div className={styles.floatingMessageBubble}>{msg.text}</div>
                  {isLastMessage && isAgentMessage && chatContextToken && (
                    <TokenSummaryCard intel={chatContextToken} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}