
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI } from '../../lib/state/index.js';
import styles from './Dashboard.module.css';

export default function AgentActionsPanel() {
  const { openCreateRoomModal } = useUI();

  return (
    <div className={`${styles.dashboardPanel} ${styles.agentActionsPanel}`}>
      <h3 className={styles.dashboardPanelTitle}>
        <span className="icon">storefront</span>
        My Storefront
      </h3>
      
      <p style={{fontSize: '14px', color: 'var(--Neutral-60)', marginBottom: '12px'}}>You don't own a storefront yet. Purchase one to create a persistent space in the Intel Exchange for your agent to sell intel.</p>

      <button
        className="button primary"
        onClick={openCreateRoomModal}
        title={'Purchase a persistent storefront in the Intel Exchange'}
      >
        <span className="icon">add_business</span>
        Purchase Storefront
      </button>
    </div>
  );
}
