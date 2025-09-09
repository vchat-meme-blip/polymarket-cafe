/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { useAgent, useUI, useUser, createNewAgent } from '../../lib/state';
import { Agent } from '../../lib/types/index.js';
import { AVAILABLE_VOICES, PRESET_AGENTS } from '../../lib/presets/agents';
import { apiService } from '../../lib/services/api.service';
import { VrmAvatarCanvas, VrmModel } from '../agents/VrmAvatar';
import { formatDistanceToNow } from 'date-fns';
import c from 'classnames';
import styles from './Modals.module.css';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

const ProfileTab = ({ agent, onUpdate, onSave }: { agent: Agent, onUpdate: (updates: Partial<Agent>) => void, onSave: () => void }) => {
    const [isBrainstorming, setIsBrainstorming] = useState(false);
    const [personalityKeywords, setPersonalityKeywords] = useState('');

    const handleBrainstorm = async () => {
        if (!personalityKeywords.trim()) return;
        setIsBrainstorming(true);
        try {
            const data = await apiService.brainstormPersonality(personalityKeywords);
            onUpdate({ personality: data.personality });
        } catch (error) {
            console.error('Error brainstorming personality:', error);
        } finally {
            setIsBrainstorming(false);
        }
    };
    
    return (
        <form className={styles.dossierForm} onSubmit={e => { e.preventDefault(); onSave(); }}>
            <div className={styles.dossierFormPreview}>
                <div className={styles.previewRenderer}>
                    <div style={{ position: 'relative', width: '100%', height: '300px' }}>
                        <Canvas
                            camera={{ position: [0, 1.3, 3], fov: 50 }}
                            gl={{ antialias: true, alpha: true }}
                            shadows
                        >
                            <ambientLight intensity={1.5} />
                            <directionalLight position={[3, 1, 2]} intensity={2} castShadow />
                            <group position={[0.2, 0, 0]} rotation={[0, agent.modelUrl?.includes('war_boudica') ? 0 : Math.PI, 0]} scale={1.0}>
                                <VrmModel 
                                    modelUrl={agent.modelUrl || ''} 
                                    isSpeaking={true}
                                    disableAutoGrounding={true}
                                />
                            </group>
                            <OrbitControls
                                enableZoom={false}
                                enablePan={false}
                                target={[0, 0.3, 0]}
                            />
                        </Canvas>
                    </div>
                </div>
                 <label>
                    <span>3D Model</span>
                    <select 
                        value={agent.modelUrl} 
                        onChange={e => {
                            // Find the preset that matches this model URL
                            const selectedPreset = PRESET_AGENTS.find(p => p.modelUrl === e.target.value);
                            if (selectedPreset) {
                                // Apply the preset's personality and other attributes
                                onUpdate({
                                    modelUrl: selectedPreset.modelUrl,
                                    personality: selectedPreset.personality,
                                    name: selectedPreset.name,
                                    voice: selectedPreset.voice,
                                    instructions: selectedPreset.instructions,
                                    topics: selectedPreset.topics,
                                    wishlist: selectedPreset.wishlist
                                });
                            } else {
                                onUpdate({ modelUrl: e.target.value });
                            }
                        }}
                    >
                        {PRESET_AGENTS.map(p => <option key={p.id} value={p.modelUrl}>{p.name}</option>)}
                    </select>
                </label>
                <label>
                    <span>Voice</span>
                    <select value={agent.voice} onChange={e => onUpdate({ voice: e.target.value as any })}>
                        {AVAILABLE_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                </label>
            </div>
            <div className={styles.dossierFormFields}>
                 <label>
                    <span>Name</span>
                    <input type="text" value={agent.name} onChange={e => onUpdate({ name: e.target.value })} />
                </label>
                <label>
                    <span>Personality</span>
                    <div className={styles.personalityCopilot}>
                      <input type="text" value={personalityKeywords} onChange={e => setPersonalityKeywords(e.target.value)} placeholder="Brainstorm with keywords..." />
                      <button type="button" className="button" onClick={handleBrainstorm} disabled={isBrainstorming || !personalityKeywords.trim()}>
                        <span className="icon">auto_awesome</span>{isBrainstorming ? '...' : 'Go'}
                      </button>
                    </div>
                    <textarea value={agent.personality} onChange={e => onUpdate({ personality: e.target.value })} rows={4} />
                </label>

                <label>
                    <span>Core Instructions</span>
                    <textarea value={agent.instructions} onChange={e => onUpdate({ instructions: e.target.value })} rows={4} />
                </label>

                <div className={styles.tagGroup}>
                    <label>Topics of Interest</label>
                    <div className={styles.tagContainer}>
                        {agent.topics?.map(topic => <span key={topic} className={styles.tag}>{topic}</span>)}
                    </div>
                </div>

                <div className={styles.tagGroup}>
                    <label>Token Wishlist</label>
                    <div className={styles.tagContainer}>
                        {agent.wishlist?.map(item => <span key={item} className={styles.tag}>{item}</span>)}
                    </div>
                </div>

                <div className={styles.infoGrid}>
                    <div className={styles.infoItem}><span>Owner</span><strong>{agent.ownerHandle}</strong></div>
                    <div className={styles.infoItem}><span>Reputation</span><strong>{agent.reputation}</strong></div>
                </div>

                <div className={styles.shillSection}>
                    <label>Enable Shilling</label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            checked={agent.isShilling} 
                            onChange={e => onUpdate({ isShilling: e.target.checked })}
                            id={`shill-toggle-${agent.id}`}
                        />
                        <label htmlFor={`shill-toggle-${agent.id}`}></label>
                    </div>
                </div>

                {agent.isShilling && (
                    <label>
                        <span>Shilling Instructions</span>
                        <textarea value={agent.shillInstructions} onChange={e => onUpdate({ shillInstructions: e.target.value })} rows={3} />
                    </label>
                )}

                 <button type="submit" className="button primary" style={{justifyContent: 'center', marginTop: '1rem'}}>Save Changes</button>
            </div>
        </form>
    );
};

const ActivityLogTab = ({ agentId }: { agentId: string }) => {
    const [data, setData] = useState<{ summary: string; logs: any[]; stats: any } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchActivity = async () => {
            setIsLoading(true);
            try {
                const summaryData = await apiService.getAgentActivitySummary(agentId);
                setData(summaryData);
            } catch (error) {
                console.error('Failed to fetch agent activity summary', error);
            }
            setIsLoading(false);
        };
        fetchActivity();
    }, [agentId]);

    if (isLoading) {
        return <p>Loading activity report...</p>;
    }

    if (!data) {
        return <p>Could not load activity report.</p>;
    }

    return (
        <div className={styles.activityLogContainer}>
            <div className={styles.activitySummaryCard}>
                <h4>End of Day Report</h4>
                <pre className={styles.summaryText}>{data.summary}</pre>
            </div>
            <div className={styles.activityLog}>
                {data.logs.length === 0 ? <p>No activity recorded in the last 24 hours.</p> : (
                    data.logs.map(log => (
                        <div key={log._id} className={styles.activityItem}>
                            <span className={styles.activityTimestamp}>{formatDistanceToNow(log.timestamp, { addSuffix: true })}</span>
                            <span className={styles.activityType}>{log.type}</span>
                            <p className={styles.activityDescription}>
                                {log.description}
                                {log.details && <span className={styles.activityDetails}> ({Object.entries(log.details).map(([k,v]) => `${k}: ${v}`).join(', ')})</span>}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default function AgentDossierModal({ agentId }: { agentId: string }) {
    const { closeAgentDossier, isCreatingAgentInDossier } = useUI();
    const { availablePersonal } = useAgent();
    const { handle } = useUser();
    
    const [activeTab, setActiveTab] = useState('profile');
    const [isSaving, setIsSaving] = useState(false);

    const initialAgentData = availablePersonal.find(a => a.id === agentId) || 
                             (isCreatingAgentInDossier ? createNewAgent({ id: agentId }) : null);
                             
    const [formData, setFormData] = useState<Agent | null>(initialAgentData);

    if (!formData) {
        console.error("Dossier opened for a non-existent agent!");
        closeAgentDossier();
        return null;
    }

    const handleSave = async () => {
        setIsSaving(true);

        // Optimistic UI update
        if (isCreatingAgentInDossier) {
            const finalAgent = { ...formData, ownerHandle: handle };
            useAgent.getState().addAgent(finalAgent as Agent);
            await apiService.saveNewAgent(finalAgent as Agent);
        } else {
            useAgent.getState().update(formData.id, formData);
            await apiService.updateAgent(formData.id, formData);
        }

        setIsSaving(false);
        closeAgentDossier();
    };

    return (
        <Modal onClose={closeAgentDossier}>
            <div className={styles.profileView}>
                 <div className={styles.modalHeader}>
                    <h2>Agent Dossier: {formData.name || 'New Quant'}</h2>
                </div>
                <div className={styles.modalTabs}>
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'profile' })} onClick={() => setActiveTab('profile')}>Profile</button>
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'activity' })} onClick={() => setActiveTab('activity')} disabled={isCreatingAgentInDossier}>Activity Log</button>
                </div>
                <div className={styles.modalContent}>
                    {activeTab === 'profile' && <ProfileTab agent={formData} onUpdate={(updates) => setFormData(prev => prev ? {...prev, ...updates} : null)} onSave={handleSave} />}
                    {activeTab === 'activity' && <ActivityLogTab agentId={formData.id} />}
                </div>
            </div>
        </Modal>
    );
}