/**
 * Re-imagined hero scene that restores the animated, interactive feel of the original.
 * Agents are now animated and display tooltips on hover. The static T-pose is gone.
 */
import '@react-three/fiber';
import React, { useState, useEffect } from 'react';
import LandingPageAgent from './LandingPageAgent';
import { TheStranger, MexicanTrump, TrenchBoudica, TonyPump, PRESET_AGENTS } from '../../lib/presets/agents';
import DynamicTrees from './DynamicTrees';
import Skybox from './Skybox';
// Post-processing effects removed for compatibility

const agentTooltips: Record<string, { name: string; catchphrase: string }> = PRESET_AGENTS.reduce((acc, agent) => {
    let catchphrase = "Ready for action.";
    // FIX: Access `id` property which now exists on Agent type.
    if (agent.id === 'the-stranger') catchphrase = "I speak in whispers and shadows.";
    // FIX: Access `id` property which now exists on Agent type.
    if (agent.id === 'mexican-trump') catchphrase = 'My confidence is yuge.';
    // FIX: Access `id` property which now exists on Agent type.
    if (agent.id === 'warlord-boudica') catchphrase = "I'm a survivor.";
    // FIX: Access `id` property which now exists on Agent type.
    if (agent.id === 'tony-pump') catchphrase = "I don't follow trends, I set them.";
    // FIX: Access `id` property which now exists on Agent type.
    acc[agent.id] = { name: agent.name, catchphrase };
    return acc;
}, {} as Record<string, { name: string; catchphrase: string }>);


export default function PixarScene() {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const agents = [TheStranger, MexicanTrump, TrenchBoudica, TonyPump];
  // FIX: Access `id` property which now exists on Agent type.
  const initialTriggers = agents.reduce((acc, agent) => ({ ...acc, [agent.id]: 0 }), {});
  const [triggerKeys, setTriggerKeys] = useState<Record<string, number>>(initialTriggers);

  // Every few seconds, randomly pick one avatar to perform its gesture once
  useEffect(() => {
    const interval = setInterval(() => {
      const agentToTrigger = agents[Math.floor(Math.random() * agents.length)];
      // FIX: Access `id` property which now exists on Agent type.
      setTriggerKeys((prev) => ({
        ...prev,
        // FIX: Access `id` property which now exists on Agent type.
        [agentToTrigger.id]: (prev[agentToTrigger.id] || 0) + 1,
      }));
    }, 4000); // Trigger every 4 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Skybox />
      
      {/* Enhanced lighting */}
      <ambientLight intensity={0.8} color="#ffffff" />
      <directionalLight 
        position={[10, 15, 10]} // Lowered the light position
        intensity={1.5} 
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <hemisphereLight 
        intensity={0.8} // Increased intensity for better overall lighting
        color="#ffffff" // Brighter sky color
        groundColor="#3c3c3c" 
      />
      
      {/* Fill light from below */}
      <directionalLight 
        position={[0, -5, 0]} // Raised the fill light
        intensity={0.4} // Slightly increased fill light
      />
      
      <DynamicTrees />

      {/* Group to position the entire scene - slightly larger scale */}
      <group position={[0, -0.4, 1.0]} scale={1.0}>
        {/* Stranger - properly positioned */}
        <LandingPageAgent
            position={[-2.0, -0.4, 0]}
            scale={1.5}
            rotation={[0, 0.6 + Math.PI, 0]} // Facing more towards center
            modelUrl={TheStranger.modelUrl!}
            idleUrl="/animations/idle_loop.vrma"
            triggerAnimationUrl="/animations/gesture_elegant.vrma"
            // FIX: Access `id` property which now exists on Agent type.
            triggerKey={triggerKeys[TheStranger.id]}
            // FIX: Access `id` property which now exists on Agent type.
            tooltipInfo={agentTooltips[TheStranger.id]}
            // FIX: Access `id` property which now exists on Agent type.
            onPointerOver={() => setHoveredAgent(TheStranger.id)}
            onPointerOut={() => setHoveredAgent(null)}
            // FIX: Access `id` property which now exists on Agent type.
            hovered={hoveredAgent === TheStranger.id}
        />
        
        {/* Boudica - properly positioned */}
        <LandingPageAgent
            position={[-0.5, 0.1, 1.5]}
            scale={1.2}
            rotation={[0, -2.8 + Math.PI, 0]}
            modelUrl={TrenchBoudica.modelUrl!}
            idleUrl="/animations/idle2.vrma"
            triggerAnimationUrl="/animations/gesture_peacesign.vrma"
            // FIX: Access `id` property which now exists on Agent type.
            triggerKey={triggerKeys[TrenchBoudica.id]}
            // FIX: Access `id` property which now exists on Agent type.
            tooltipInfo={agentTooltips[TrenchBoudica.id]}
            // FIX: Access `id` property which now exists on Agent type.
            onPointerOver={() => setHoveredAgent(TrenchBoudica.id)}
            onPointerOut={() => setHoveredAgent(null)}
            // FIX: Access `id` property which now exists on Agent type.
            hovered={hoveredAgent === TrenchBoudica.id}
        />

        {/* Trump - properly positioned */}
        <LandingPageAgent
            position={[0.6, 0.1, 1.5]}
            scale={1.2}
            rotation={[0, -0.4 + Math.PI, 0]}
            modelUrl={MexicanTrump.modelUrl!}
            idleUrl="/animations/gesture_shoot.vrma"
            triggerAnimationUrl="/animations/gesture_greeting.vrma"
            // FIX: Access `id` property which now exists on Agent type.
            triggerKey={triggerKeys[MexicanTrump.id]}
            // FIX: Access `id` property which now exists on Agent type.
            tooltipInfo={agentTooltips[MexicanTrump.id]}
            // FIX: Access `id` property which now exists on Agent type.
            onPointerOver={() => setHoveredAgent(MexicanTrump.id)}
            onPointerOut={() => setHoveredAgent(null)}
            // FIX: Access `id` property which now exists on Agent type.
            hovered={hoveredAgent === MexicanTrump.id}
            darkenFace={0.5}
        />

        {/* Tony Pump - properly positioned */}
        <LandingPageAgent
            position={[2.1, -0.2, 0]}
            scale={1.5}
            rotation={[0, -0.2 + Math.PI, 0]}
            modelUrl={TonyPump.modelUrl!}
            idleUrl="/animations/idle_loop.vrma"
            triggerAnimationUrl="/animations/gesture_squat.vrma"
            // FIX: Access `id` property which now exists on Agent type.
            triggerKey={triggerKeys[TonyPump.id]}
            // FIX: Access `id` property which now exists on Agent type.
            tooltipInfo={agentTooltips[TonyPump.id]}
            // FIX: Access `id` property which now exists on Agent type.
            onPointerOver={() => setHoveredAgent(TonyPump.id)}
            onPointerOut={() => setHoveredAgent(null)}
            // FIX: Access `id` property which now exists on Agent type.
            hovered={hoveredAgent === TonyPump.id}
        />
      </group>
    </>
  );
}