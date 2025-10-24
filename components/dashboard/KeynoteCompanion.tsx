/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Fix imports for `useAgent` and `useUI` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useAgent, useUI } from '../../lib/state/index.js';
import DashboardAgent from './DashboardAgent';
import styles from './Dashboard.module.css';

/**
 * The main 3D agent display area on the dashboard.
 */
export default function KeynoteCompanion() {
  const { current } = useAgent();
  const { isAgentResponding } = useUI();

  return (
    <div className={styles.keynoteCompanion}>
      <DashboardAgent agent={current} isSpeaking={isAgentResponding} />
    </div>
  );
}