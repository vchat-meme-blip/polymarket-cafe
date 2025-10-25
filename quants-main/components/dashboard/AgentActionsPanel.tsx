/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent } from '../../lib/state';
import { useArenaStore } from '../../lib/state/arena';
import { useAutonomyStore } from '../../lib/state/autonomy';
import { apiService } from '../../lib/services/api.service';
import styles from './Dashboard.module.css';

export default function AgentActionsPanel() {
  const { current: userAgent } = useAgent();
  const { setActivity } = useAutonomyStore();
  const { agentLocations } = useArenaStore();

  const isAgentInCafe = agentLocations[userAgent.id] !== null;

  // This is now an event-driven API call, not a client-side state change.
  const handleSendToCafe = () => {
    setActivity('WANDERING_IN_CAFE');
    apiService.sendAgentToCafe(userAgent.id);
  };

  const handleCreateRoom = () => {
    setActivity('IN_CAFE', 'Creating a new room...');
    apiService.createAndHostRoom(userAgent.id);
  };

  return (
    <div className={`${styles.dashboardPanel} ${styles.agentActionsPanel}`}>
      <h3 className={styles.dashboardPanelTitle}>
        <span className="icon">smart_toy</span>
        Agent Actions
      </h3>
      <button
        className="button"
        onClick={handleSendToCafe}
        disabled={isAgentInCafe}
        title={isAgentInCafe ? 'Your agent is already in the Café' : 'Send your agent to find a room'}
      >
        <span className="icon">coffee</span>
        Send to Café
      </button>
      <button
        className="button"
        onClick={handleCreateRoom}
        disabled={isAgentInCafe}
         title={isAgentInCafe ? 'Your agent is already in the Café' : 'Create a new room with your agent as the host'}
      >
        <span className="icon">add_comment</span>
        Create & Host Room
      </button>
    </div>
  );
}