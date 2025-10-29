/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { Suspense } from 'react';
import { Agent } from '../../lib/types/index.js';
import { DEFAULT_VRM_URL } from '../../lib/presets/agents';
import { VrmAvatarCanvas, VrmPlaceholder } from '../agents/VrmAvatar';

type AgentCardAvatarProps = {
  agent: Partial<Agent>;
  isSpeaking: boolean;
};

/**
 * Renders a 3D agent preview specifically for the cards in the "My Agents" view.
 * This component is isolated to ensure its logic doesn't conflict with other agent views.
 */
export default function AgentCardAvatar({ agent, isSpeaking }: AgentCardAvatarProps) {
  const urlToLoad = agent.modelUrl || DEFAULT_VRM_URL;
  return (
    <Suspense fallback={<VrmPlaceholder status="loading" />}>
      {/* We can potentially use different canvas props here in the future for optimization */}
      <VrmAvatarCanvas modelUrl={urlToLoad} isSpeaking={isSpeaking} />
    </Suspense>
  );
}