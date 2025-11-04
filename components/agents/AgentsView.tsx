/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent, useUI, createNewAgent } from '../../lib/state/index.js';
import c from 'classnames';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, View } from '@react-three/drei';
import { VrmModel } from './VrmAvatar';
import styles from './AgentsView.module.css';
import React, { useRef, createRef } from 'react';

export default function AgentsView() {
  const {
    availablePersonal,
    setCurrent,
    current: currentAgent,
  } = useAgent();
  const { openAgentDossier } = useUI();
  const mainCanvasRef = useRef<HTMLDivElement>(null);
  
  // Create and manage an array of refs, one for each agent card's viewport div.
  // This ensures that each <View> has a stable reference to track.
  const viewRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);
  viewRefs.current = availablePersonal.map(
    (_, i) => viewRefs.current[i] ?? createRef<HTMLDivElement>()
  );

  const handleCreateNew = () => {
    const newAgent = createNewAgent({ name: 'New Quant' });
    if (!newAgent.id) {
      console.error('Failed to create agent: No ID returned');
      return;
    }
    openAgentDossier(newAgent.id, true);
  };

  const handleViewDossier = (agentId: string) => {
    openAgentDossier(agentId);
  };

  return (
    <div ref={mainCanvasRef} className={styles.agentsView}>
      <div className={styles.agentsViewHeader}>
        <h2>My Agents</h2>
        <button className="button primary" onClick={handleCreateNew}>
          <span className="icon">add</span>Create New Quant
        </button>
      </div>
      <div className={styles.agentsGrid}>
        {availablePersonal.map((agent, index) => (
          <div key={agent.id} className={styles.agentCard} onClick={() => handleViewDossier(agent.id)}>
            <div className={styles.agentCardHeader}>
              <div className={styles.agentCardPreview} ref={viewRefs.current[index]} />
              <h3
                className={c(styles.agentCardName, {
                  [styles.activeAgent]: agent.id === currentAgent.id,
                })}
              >
                {agent.name}
              </h3>
            </div>
            <p className={styles.agentCardPersonality}>{agent.personality}</p>
            <div className={styles.agentCardActions}>
              <button
                className="button primary"
                onClick={(e) => { e.stopPropagation(); setCurrent(agent.id); }}
                disabled={agent.id === currentAgent.id}
              >
                <span className="icon">play_circle</span>
                {agent.id === currentAgent.id ? 'Active' : 'Set Active'}
              </button>
              <button
                className="button secondary"
                onClick={(e) => { e.stopPropagation(); handleViewDossier(agent.id); }}
              >
                <span className="icon">assignment</span>View Dossier
              </button>
            </div>
          </div>
        ))}
        <div className={styles.createAgentCard} onClick={handleCreateNew}>
          <span className="icon">add</span>
          <p>Create New Quant</p>
        </div>
      </div>
      <Canvas
        className={styles.mainCanvas}
        shadows
        gl={{ antialias: true, alpha: true }}
      >
        <View.Port />
        {availablePersonal.map((agent, index) => (
          <View key={agent.id} index={index + 1} track={viewRefs.current[index] as any}>
            <ambientLight intensity={1.5} />
            <directionalLight position={[3, 5, 2]} intensity={2} castShadow />
            {/* Adjusted positioning to properly center the model in the card */}
            <group position={[0, -1.0, 0]} scale={1.2} rotation={[0, agent.modelUrl?.includes('war_boudica') ? 0 : Math.PI, 0]}>
              <VrmModel modelUrl={agent.modelUrl || ''} isSpeaking={false} />
            </group>
            <OrbitControls makeDefault enableZoom={false} enablePan={false} target={[0, 1.0, 0]} />
          </View>
        ))}
      </Canvas>
    </div>
  );
}