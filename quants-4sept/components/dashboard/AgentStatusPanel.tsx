/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent } from '../../lib/state';
import { useAutonomyStore } from '../../lib/state/autonomy';

type AgentStatusPanelProps = {
  onToggleControls: () => void;
};

export default function AgentStatusPanel({
  onToggleControls,
}: AgentStatusPanelProps) {
  const { activity, statusMessage } = useAutonomyStore();

  return (
    <div className="agent-status-panel">
      <div
        className="agent-icon"
        style={{ backgroundColor: 'var(--brand-primary)' }}
        title="Click to toggle autonomy controls"
        onClick={onToggleControls}
      >
        <span className="icon">smart_toy</span>
      </div>
      <div className="status-text">
        <strong>{activity}:</strong> {statusMessage}
      </div>
    </div>
  );
}
