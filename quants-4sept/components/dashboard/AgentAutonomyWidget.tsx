/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState } from 'react';
import AgentStatusPanel from './AgentStatusPanel';
import AutonomyControlsPanel from './AutonomyControlsPanel';
import c from 'classnames';
import styles from './Dashboard.module.css';

/**
 * A consolidated, interactive widget to display agent status and house
 * autonomy controls, designed with a "glassmorphism" aesthetic.
 */
export default function AgentAutonomyWidget() {
  const [showControls, setShowControls] = useState(false);

  return (
    <div
      className={c(styles.agentAutonomyWidget, {
        [styles.controlsVisible]: showControls,
      })}
    >
      <AgentStatusPanel onToggleControls={() => setShowControls(prev => !prev)} />
      {showControls && <AutonomyControlsPanel />}
    </div>
  );
}