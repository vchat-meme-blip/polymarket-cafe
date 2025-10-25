/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAutonomyStore } from '../../lib/state/autonomy';
import styles from './AgentAutonomyWidget.module.css';

const MS_PER_MINUTE = 60000;

export default function AutonomyControlsPanel() {
  const {
    isAutonomyEnabled,
    toggleAutonomy,
    gatherIntelCooldown,
    setGatherIntelCooldown,
    researchIntelCooldown,
    setResearchIntelCooldown,
  } = useAutonomyStore();

  const gatherIntervalMinutes = gatherIntelCooldown / MS_PER_MINUTE;
  const researchIntervalMinutes = researchIntelCooldown / MS_PER_MINUTE;

  return (
    <div className={styles.autonomyControlsPanel}>
      <div className={styles.controlGroup}>
        <div className={styles.controlLabel}>
          <span>Enable Autonomous Behavior</span>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={isAutonomyEnabled}
              onChange={toggleAutonomy}
            />
            <span className={styles.toggleSwitchSlider}></span>
          </label>
        </div>
      </div>

      <div className={styles.controlGroup}>
        <div className={styles.controlLabel}>
          <span>Gather Intel Every:</span>
          <span className={styles.controlValue}>{gatherIntervalMinutes} min</span>
        </div>
        <input
          type="range"
          min="5"
          max="60"
          step="5"
          value={gatherIntervalMinutes}
          onChange={e =>
            setGatherIntelCooldown(Number(e.target.value) * MS_PER_MINUTE)
          }
          className={styles.rangeSlider}
          disabled={!isAutonomyEnabled}
        />
      </div>

      <div className={styles.controlGroup}>
        <div className={styles.controlLabel}>
          <span>Research Intel Every:</span>
          <span className={styles.controlValue}>{researchIntervalMinutes} min</span>
        </div>
        <input
          type="range"
          min="5"
          max="60"
          step="5"
          value={researchIntervalMinutes}
          onChange={e =>
            setResearchIntelCooldown(Number(e.target.value) * MS_PER_MINUTE)
          }
          className={styles.rangeSlider}
          disabled={!isAutonomyEnabled}
        />
      </div>
    </div>
  );
}