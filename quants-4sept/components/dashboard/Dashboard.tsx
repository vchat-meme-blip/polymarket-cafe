/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import ControlTray from '../console/control-tray/ControlTray';
import KeynoteCompanion from '../demo/keynote-companion/KeynoteCompanion';
import Header from '../Header';
import { useUI } from '../../lib/state';
import useAutonomyDirector from '../../hooks/useAutonomyDirector';
import IntelBankPanel from './IntelBankPanel';
import AgentAutonomyWidget from './AgentAutonomyWidget';
import DirectChatLog from './DirectChatLog';
import ProfileView from '../profile/ProfileView';
import AgentActionsPanel from './AgentActionsPanel';
import styles from './Dashboard.module.css';

/**
 * The main view for a user to interact with and monitor their selected agent.
 */
export default function Dashboard() {
  const { showProfileView } = useUI();
  // Initialize the agent's autonomous brain
  useAutonomyDirector();

  return (
    <>
      <div className={styles.dashboardGrid}>
        <div className={styles.dashboardHeader}>
          <Header />
        </div>

        <div className={styles.dashboardMain}>
          <div className={styles.streamingConsole}>
            <main>
              <div className={styles.mainAppArea}>
                <AgentAutonomyWidget />
                <KeynoteCompanion />
                <DirectChatLog />
              </div>
            </main>
            <ControlTray />
          </div>
        </div>

        <div className={styles.dashboardRight}>
          <AgentActionsPanel />
          <IntelBankPanel />
        </div>
      </div>

      {showProfileView && <ProfileView />}
    </>
  );
}