/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import ControlTray from '../console/control-tray/ControlTray';
import KeynoteCompanion from './KeynoteCompanion';
import { useAgent, useUI, useUser } from '../../lib/state';
import useAutonomyDirector from '../../hooks/useAutonomyDirector';
import IntelBankPanel from './IntelBankPanel';
import AgentAutonomyWidget from './AgentAutonomyWidget';
import DirectChatLog from './DirectChatLog';
import AgentActionsPanel from './AgentActionsPanel';
import FirstAgentPrompt from '../onboarding/FirstAgentPrompt';
import styles from './Dashboard.module.css';

/**
 * The main view for a user to interact with and monitor their selected agent.
 * Now intelligently shows a welcome prompt to new users.
 */
export default function Dashboard() {
  const { hasCompletedOnboarding } = useUser();
  const { availablePersonal } = useAgent();
  
  // Initialize the agent's autonomous brain
  useAutonomyDirector();

  const isNewUser = !hasCompletedOnboarding && availablePersonal.length === 0;

  if (isNewUser) {
    return <FirstAgentPrompt />;
  }

  return (
    <>
      <div className={styles.dashboardGrid}>
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
    </>
  );
}
