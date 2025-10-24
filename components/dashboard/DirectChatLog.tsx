/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Fix imports for `useAgent`, `useUI`, and `useUser` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useAgent, useUI, useUser } from '../../lib/state/index.js';
import { USER_ID, useArenaStore } from '../../lib/state/arena';
import c from 'classnames';
import { format } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';
import styles from './Dashboard.module.css';
import { MarketIntel } from '../../lib/types/index.js';

const TypingIndicator = () => (
    <div className={c(styles.chatMessage, styles.agent, styles.typingIndicator)}>
        <div className={styles.messageAvatar}>
            <span className="material-symbols-outlined">smart_toy</span>
        </div>
        <div className={styles.messageContent}>
            <div className={styles.messageBubble}>
                <div className={styles.dot}></div>
                <div className={styles.dot}></div>
                <div className={styles.dot}></div>
            </div>
        </div>
    </div>
);

const MarketCardInChat = ({ market }: { market: MarketIntel }) => {
    const { openMarketDetailModal } = useUI();
    return (
        <div className={styles.marketCardInChat} onClick={() => openMarketDetailModal(market)}>
            <p className={styles.title}>{market.title}</p>
            <div className={styles.odds}>
                <span>YES: {Math.round(market.odds.yes * 100)}¢</span>
                <span>NO: {Math.round(market.odds.no * 100)}¢</span>
            </div>
        </div>
    );
};


/**
 * A component that displays the live, persisted chat history
 * between the user and their current agent as floating chat bubbles.
 */
export default function DirectChatLog() {
  const { current: currentAgent } = useAgent();
  const { name: userName } = useUser();
  const { isAgentTyping } = useUI();
  const { agentConversations } = useArenaStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationHistory = useMemo(() => {
    return agentConversations[currentAgent.id]?.[USER_ID] || [];
  }, [agentConversations, currentAgent.id]);

  useEffect(() => {
    // Automatically scroll to the bottom of the chat log on new messages or when typing starts
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationHistory, isAgentTyping]);

  return (
    <div className={styles.directChatLogContainer}>
      <div className={styles.directChatLog} ref={scrollRef}>
        {conversationHistory.length === 0 && !isAgentTyping ? (
          <div className={styles.emptyChatLog}>
            <p>Your direct chat with {currentAgent.name} will appear here.</p>
          </div>
        ) : (
          <>
            {conversationHistory.map((msg, index) => (
                <div
                    key={index}
                    className={c(styles.chatMessage, {
                    [styles.user]: msg.agentId === USER_ID,
                    [styles.agent]: msg.agentId !== USER_ID,
                    })}
                    aria-label={`Message from ${msg.agentName} at ${format(
                    msg.timestamp,
                    'p',
                    )}`}
                >
                    <div className={styles.messageAvatar}>
                    <span className="material-symbols-outlined">
                        {msg.agentId === USER_ID ? 'person' : 'smart_toy'}
                    </span>
                    </div>
                    <div className={styles.messageContent}>
                        <div className={styles.messageHeader}>
                            <span className={styles.messageName}>{msg.agentName}</span>
                            <span className={styles.messageTime}>{format(msg.timestamp, 'p')}</span>
                        </div>
                        <div className={styles.messageBubble}>
                            {msg.text}
                            {msg.markets && msg.markets.length > 0 && (
                                <div className={styles.marketCardList}>
                                    {msg.markets.map(market => (
                                        <MarketCardInChat key={market.id} market={market} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            {isAgentTyping && <TypingIndicator />}
          </>
        )}
      </div>
    </div>
  );
}