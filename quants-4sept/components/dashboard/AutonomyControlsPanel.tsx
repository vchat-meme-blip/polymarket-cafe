/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAutonomyStore } from '../../lib/state/autonomy';

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
    <div className="autonomy-controls-panel">
      <div className="control-group">
        <div className="control-label">
          <span>Enable Autonomous Behavior</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isAutonomyEnabled}
              onChange={toggleAutonomy}
            />
            <span className="toggle-switch-slider"></span>
          </label>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">
          <span>Gather Intel Every:</span>
          <span className="control-value">{gatherIntervalMinutes} min</span>
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
          className="range-slider"
          disabled={!isAutonomyEnabled}
        />
      </div>

      <div className="control-group">
        <div className="control-label">
          <span>Research Intel Every:</span>
          <span className="control-value">{researchIntervalMinutes} min</span>
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
          className="range-slider"
          disabled={!isAutonomyEnabled}
        />
      </div>
    </div>
  );
}