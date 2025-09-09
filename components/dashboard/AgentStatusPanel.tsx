/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent } from '../../lib/state';
import { useAutonomyStore } from '../../lib/state/autonomy';
import styles from './AgentAutonomyWidget.module.css';

export default function AgentStatusPanel() {
  const { activity, statusMessage } = useAutonomyStore();

  return (
      <div className={styles.statusText}>
        <strong>{activity}:</strong> {statusMessage}
      </div>
  );
}