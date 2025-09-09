/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent } from '../../lib/presets/agents';
import c from 'classnames';
import styles from './Mail.module.css';

type ConversationListProps = {
  partners: Agent[];
  selectedPartnerId: string | null;
  onSelectPartner: (partnerId: string | null) => void;
};

export default function ConversationList({
  partners,
  selectedPartnerId,
  onSelectPartner,
}: ConversationListProps) {
  return (
    <aside className={styles.conversationList}>
      <h2>Letter Box</h2>
      {partners.length === 0 ? (
        <p className={styles.emptyList}>
          Your agent hasn't talked to anyone yet. Visit the Café!
        </p>
      ) : (
        <ul>
          {partners.map(partner => (
            <li
              key={partner.id}
              className={c(styles.conversationListItem, {
                [styles.active]: partner.id === selectedPartnerId,
              })}
            >
              <button onClick={() => onSelectPartner(partner.id)}>
                <span className={styles.agentName}>{partner.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}