/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
// FIX: The 'Agent' type is not exported from 'presets'. It is now imported from its correct source file 'lib/types/index.js'.
import { Agent } from '../../lib/types/index.js';
import { DEFAULT_VRM_URL } from '../../lib/presets/agents';
import { VrmModel, VrmPlaceholder } from '../agents/VrmAvatar';

type DashboardAgentProps = {
  agent: {
    id: string;
    modelUrl?: string; // Make modelUrl explicitly optional
  };
  isSpeaking: boolean;
};

/**
 * Renders the primary 3D agent for the main dashboard view.
 * This component is isolated to the dashboard to prevent shared logic with other views.
 */
// Helper function to determine appropriate idle animation based on agent ID (like Cafe rooms)
function getIdleAnimation(agent: Partial<Agent>): string {
  // Special idle animation for Mexican Trump (matches ArenaAgent logic)
  if (agent.id === 'mexican-trump') {
    return '/animations/idle_loop.vrma';
  }
  // Default for all other agents
  return '/animations/idle2.vrma';
}

export default function DashboardAgent({ agent, isSpeaking }: DashboardAgentProps) {
  const urlToLoad = agent.modelUrl ?? DEFAULT_VRM_URL;
  const [animationTriggerKey, setAnimationTriggerKey] = useState(0);
  const agentIdRef = useRef<string | null>(null);

  // Detect when a new agent enters this "slot" to play an animation (matches ArenaAgent)
  useEffect(() => {
    if (agent.id !== agentIdRef.current) {
      setAnimationTriggerKey(prev => prev + 1);
      agentIdRef.current = agent.id;
    }
  }, [agent.id]);

  return (
    <Suspense fallback={<VrmPlaceholder status="loading" />}>
      <div style={{ width: '100%', height: '100%', minHeight: '600px' }}>
        <Canvas
          style={{ width: '100%', height: '100%' }}
          camera={{ position: [0, 0.8, 2.5], fov: 30 }}
          gl={{ antialias: true, alpha: true }}
          shadows
        >
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 5, 2]} intensity={2} castShadow />
          <group rotation={[0, urlToLoad.includes('war_boudica') ? 0 : Math.PI, 0]}>
            <VrmModel 
              modelUrl={urlToLoad} 
              isSpeaking={isSpeaking}
              disableAutoGrounding={true}
              verticalOffset={-0.2}
              idleUrl={getIdleAnimation(agent)}
              triggerAnimationUrl="/animations/gesture_ready.vrma"
              triggerKey={animationTriggerKey}
              talkAnimationUrl="/animations/gesture_shoot.vrma"
            />
          </group>
          <OrbitControls
            enableZoom={true}
            enablePan={false}
            target={[0, 0.8, 0]}
            minDistance={1.5}
            maxDistance={5.0}
          />
        </Canvas>
      </div>
    </Suspense>
  );
}