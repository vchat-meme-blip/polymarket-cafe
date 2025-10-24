/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI } from '../../lib/state/index.js';
import styles from './Dashboard.module.css';

export default function ManageRoomPanel() {
  const { openManageRoomModal } = useUI();

  return (
    <div className={`${styles.dashboardPanel} ${styles.agentActionsPanel}`}>
      <h3 className={styles.dashboardPanelTitle}>
        <span className="icon">storefront</span>
        My Storefront
      </h3>
      <button
        className="button"
        onClick={openManageRoomModal}
        title={'Manage your owned room'}
      >
        <span className="icon">settings</span>
        Manage Room
      </button>
      {/* Additional stats or quick actions for the room can be added here in the future */}
    </div>
  );
}