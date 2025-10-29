/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { Suspense } from 'react';
import { Agent } from '../../lib/types/index.js';
import { DEFAULT_VRM_URL } from '../../lib/presets/agents';
import { VrmAvatarCanvas as VrmAvatar, VrmPlaceholder } from './VrmAvatar';

type AgentRendererProps = {
  agent: Partial<Agent>; // Use partial for preview in editor
  isSpeaking: boolean;
};

/**
 * A component that renders a 3D agent representation.
 * All 2D rendering logic has been deprecated.
 */
export default function AgentRenderer({ agent, isSpeaking }: AgentRendererProps) {
  // Use the agent's specified model URL, or fall back to the default if it's missing.
  const urlToLoad = agent.modelUrl || DEFAULT_VRM_URL;
  return (
    <Suspense fallback={<VrmPlaceholder status="loading" />}>
      <VrmAvatar modelUrl={urlToLoad} isSpeaking={isSpeaking} />
    </Suspense>
  );
}