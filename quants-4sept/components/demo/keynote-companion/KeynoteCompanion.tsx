/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent, useUI } from '../../../lib/state';
import AgentRenderer from '../../agents/AgentRenderer';

export default function KeynoteCompanion() {
  const { current } = useAgent();
  // FIX: Add isAgentResponding to useUI store
  const { isAgentResponding } = useUI();

  return (
    <div className="keynote-companion">
      <AgentRenderer agent={current} isSpeaking={isAgentResponding} />
    </div>
  );
}