/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Moved createNewAgent import from `presets` to `state` to resolve module not found error.
import { useAgent, useUI, createNewAgent } from '../../lib/state';
import c from 'classnames';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { VrmModel } from './VrmAvatar';
import styles from './AgentsView.module.css';

export default function AgentsView() {
  const {
    availablePersonal,
    setCurrent,
    current: currentAgent,
  } = useAgent();
  const { openAgentDossier } = useUI();

  const handleCreateNew = () => {
    const newAgent = createNewAgent({ name: 'New Quant' });
    // This will be saved to the server inside the Dossier modal
    openAgentDossier(newAgent.id, true);
  };

  const handleViewDossier = (agentId: string) => {
    openAgentDossier(agentId);
  };

  return (
    <div className={styles.agentsView}>
      <div className={styles.agentsViewHeader}>
        <h2>My Agents</h2>
        <button className="button primary" onClick={handleCreateNew}>
          <span className="icon">add</span>Create New Quant
        </button>
      </div>
      <div className={styles.agentsGrid}>
        {availablePersonal.map(agent => (
          <div key={agent.id} className={styles.agentCard} onClick={() => handleViewDossier(agent.id)}>
            <div className={styles.agentCardHeader}>
                            <div className={styles.agentCardPreview}>
                <Canvas
                  camera={{ position: [0, 0.8, 2.5], fov: 45 }}
                  gl={{ antialias: true, alpha: true }}
                  shadows
                >
                  <ambientLight intensity={1.5} />
                  <directionalLight position={[3, 5, 2]} intensity={2} castShadow />
                  <group position={[0.2, 0.5, 0]} rotation={[0, agent.modelUrl?.includes('war_boudica') ? 0 : Math.PI, 0]}>
                      <VrmModel modelUrl={agent.modelUrl || ''} isSpeaking={false} />
                  </group>
                  <OrbitControls enableZoom={false} enablePan={false} target={[0, 0.4, 0]} />
                </Canvas>
              </div>
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
    </div>
  );
}
