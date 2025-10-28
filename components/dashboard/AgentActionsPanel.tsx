/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent, useUI } from '../../lib/state/index.js';
import { useArenaStore } from '../../lib/state/arena';
import { useAutonomyStore } from '../../lib/state/autonomy';
import { apiService } from '../../lib/services/api.service.js';
import styles from './Dashboard.module.css';

export default function AgentActionsPanel() {
  const { current: userAgent } = useAgent();
  const { setActivity } = useAutonomyStore();
  const { agentLocations } = useArenaStore();
  const { openCreateRoomModal } = useUI();

  const isAgentInCafe = agentLocations[userAgent.id] !== null;

  const handleSendToCafe = () => {
    setActivity('WANDERING_IN_CAFE');
    apiService.sendAgentToCafe(userAgent.id);
  };

  const handleRecallFromCafe = () => {
    setActivity('IDLE');
    apiService.request('/api/arena/recall-agent', {
      method: 'POST',
      body: JSON.stringify({ agentId: userAgent.id }),
    });
  };

  return (
    <div className={`${styles.dashboardPanel} ${styles.agentActionsPanel}`}>
      <h3 className={styles.dashboardPanelTitle}>
        <span className="icon">smart_toy</span>
        Agent Actions
      </h3>
      
      {isAgentInCafe ? (
        <button
          className="button"
          onClick={handleRecallFromCafe}
          title="Recall your agent from the Café back to an idle state"
        >
          <span className="icon">home</span>
          Recall from Café
        </button>
      ) : (
        <button
          className="button"
          onClick={handleSendToCafe}
          title='Send your agent to the Café to find a room'
        >
          <span className="icon">coffee</span>
          Send to Café
        </button>
      )}

      <button
        className="button"
        onClick={openCreateRoomModal}
        disabled={isAgentInCafe}
         title={isAgentInCafe ? 'Your agent must be recalled before hosting a new room' : 'Create a new room with your agent as the host'}
      >
        <span className="icon">add_comment</span>
        Create & Host Room
      </button>
    </div>
  );
}