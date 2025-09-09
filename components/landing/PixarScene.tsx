/**
 * Re-imagined hero scene that restores the animated, interactive feel of the original.
 * Agents are now animated and display tooltips on hover. The static T-pose is gone.
 */
import '@react-three/fiber';
import React, { useState, useEffect } from 'react';
import LandingPageAgent from './LandingPageAgent';
import { TheStranger, MexicanTrump, TrenchBoudica, TonyPump, PRESET_AGENTS } from '../../lib/presets/agents';
import DynamicTrees from './DynamicTrees';

const agentTooltips: Record<string, { name: string; catchphrase: string }> = PRESET_AGENTS.reduce((acc, agent) => {
    let catchphrase = "Ready for action.";
    if (agent.id === 'the-stranger') catchphrase = "I speak in whispers and shadows.";
    if (agent.id === 'mexican-trump') catchphrase = 'My confidence is yuge.';
    if (agent.id === 'warlord-boudica') catchphrase = "I'm a survivor.";
    if (agent.id === 'tony-pump') catchphrase = "I don't follow trends, I set them.";
    acc[agent.id] = { name: agent.name, catchphrase };
    return acc;
}, {} as Record<string, { name: string; catchphrase: string }>);


export default function PixarScene() {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const agents = [TheStranger, MexicanTrump, TrenchBoudica, TonyPump];
  const initialTriggers = agents.reduce((acc, agent) => ({ ...acc, [agent.id]: 0 }), {});
  const [triggerKeys, setTriggerKeys] = useState<Record<string, number>>(initialTriggers);

  // Every few seconds, randomly pick one avatar to perform its gesture once
  useEffect(() => {
    const interval = setInterval(() => {
      const agentToTrigger = agents[Math.floor(Math.random() * agents.length)];
      setTriggerKeys((prev) => ({
        ...prev,
        [agentToTrigger.id]: (prev[agentToTrigger.id] || 0) + 1,
      }));
    }, 4000); // Trigger every 4 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[0, 2, 8]} intensity={2.0} />
      <hemisphereLight intensity={1} groundColor="black" color="white" />
      <DynamicTrees />

      {/* Group to position the entire scene */}
      <group position={[0, 0.5, 0]} scale={1.9}>
        <LandingPageAgent
            position={[-2.2, -0.1, 0]}
            scale={1.0} /* Use standardized scale */
            rotation={[0, 0.4 + Math.PI, 0]}
            modelUrl={TheStranger.modelUrl!}
            idleUrl="/animations/idle_loop.vrma"
            triggerAnimationUrl="/animations/gesture_elegant.vrma"
            triggerKey={triggerKeys[TheStranger.id]}
            tooltipInfo={agentTooltips[TheStranger.id]}
            onPointerOver={() => setHoveredAgent(TheStranger.id)}
            onPointerOut={() => setHoveredAgent(null)}
            hovered={hoveredAgent === TheStranger.id}
        />
        
        <LandingPageAgent
            position={[-1.2, -0.1, 0]}
            scale={1.0} /* Use standardized scale */
            rotation={[0, -2.8 + Math.PI, 0]}
            modelUrl={TrenchBoudica.modelUrl!}
            idleUrl="/animations/idle2.vrma"
            triggerAnimationUrl="/animations/gesture_peacesign.vrma"
            triggerKey={triggerKeys[TrenchBoudica.id]}
            tooltipInfo={agentTooltips[TrenchBoudica.id]}
            onPointerOver={() => setHoveredAgent(TrenchBoudica.id)}
            onPointerOut={() => setHoveredAgent(null)}
            hovered={hoveredAgent === TrenchBoudica.id}
        />

        <LandingPageAgent
            position={[1.0, -0.05, 0.1]}
            scale={1.0} /* Use standardized scale */
            rotation={[0, -0.4 + Math.PI, 0]}
            modelUrl={MexicanTrump.modelUrl!}
            idleUrl="/animations/gesture_shoot.vrma" // Unique idle
            triggerAnimationUrl="/animations/gesture_greeting.vrma"
            triggerKey={triggerKeys[MexicanTrump.id]}
            tooltipInfo={agentTooltips[MexicanTrump.id]}
            onPointerOver={() => setHoveredAgent(MexicanTrump.id)}
            onPointerOut={() => setHoveredAgent(null)}
            hovered={hoveredAgent === MexicanTrump.id}
            darkenFace={0.5}
        />

        <LandingPageAgent
            position={[1.7, -0.2, 0.2]}
            scale={1.0} /* Use standardized scale */
            rotation={[0, -0.3 + Math.PI, 0]}
            modelUrl={TonyPump.modelUrl!}
            idleUrl="/animations/idle_loop.vrma"
            triggerAnimationUrl="/animations/gesture_squat.vrma"
            triggerKey={triggerKeys[TonyPump.id]}
            tooltipInfo={agentTooltips[TonyPump.id]}
            onPointerOver={() => setHoveredAgent(TonyPump.id)}
            onPointerOut={() => setHoveredAgent(null)}
            hovered={hoveredAgent === TonyPump.id}
        />
      </group>
    </>
  );
}
