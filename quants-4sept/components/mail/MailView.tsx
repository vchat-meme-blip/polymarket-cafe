/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useMemo, useState } from 'react';
import { useAgent } from '../../lib/state';
import { useArenaStore } from '../../lib/state/arena';
import { Agent } from '../../lib/presets/agents';
import ConversationList from './ConversationList';
import ConversationDetail from './ConversationDetail';
import styles from './Mail.module.css';

function getAgentById(id: string, allAgents: Agent[]): Agent | undefined {
  return allAgents.find(agent => agent.id === id);
}

/**
 * The main view for the "Letter Box", displaying conversation histories.
 */
export default function MailView() {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null,
  );
  const { current: userAgent } = useAgent();
  const { agentConversations } = useArenaStore();
  const allAgents = [
    ...useAgent.getState().availablePresets,
    ...useAgent.getState().availablePersonal,
  ];

  const userAgentConversations = agentConversations[userAgent.id] || {};
  const conversationPartners = useMemo(
    () =>
      Object.keys(userAgentConversations)
        .map(partnerId => getAgentById(partnerId, allAgents))
        .filter((agent): agent is Agent => !!agent),
    [userAgentConversations, allAgents],
  );

  const selectedConversation =
    selectedPartnerId && userAgentConversations[selectedPartnerId]
      ? userAgentConversations[selectedPartnerId]
      : [];

  return (
    <div className={styles.mailView}>
      <ConversationList
        partners={conversationPartners}
        selectedPartnerId={selectedPartnerId}
        onSelectPartner={setSelectedPartnerId}
      />
      <ConversationDetail
        conversation={selectedConversation}
        allAgents={allAgents}
      />
    </div>
  );
}