/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useState, useMemo } from 'react';
import Modal from '../Modal';
import { useAgent, useUI, useUser, createNewAgent } from '../../lib/state';
import { Agent } from '../../lib/types/index.js';
import { AVAILABLE_VOICES, PRESET_AGENTS, VoiceProfile } from '../../lib/presets/agents';
import { apiService } from '../../lib/services/api.service';
import { VrmModel } from '../agents/VrmAvatar';
import { format } from 'date-fns';
import c from 'classnames';
import styles from './Modals.module.css';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useArenaStore } from '../../lib/state/arena.js';
import { ttsService } from '../../lib/services/tts.service.js';

const ProfileTab = ({ agent, onUpdate, onSave }: { agent: Agent, onUpdate: (updates: Partial<Agent>) => void, onSave: () => void }) => {
    const [isBrainstorming, setIsBrainstorming] = useState(false);
    const [personalityKeywords, setPersonalityKeywords] = useState('');
    const [voices, setVoices] = useState<VoiceProfile[]>(() => [...AVAILABLE_VOICES]);

    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                const fetched = await ttsService.getAvailableVoices();
                if (!isMounted) return;
                const mapped: VoiceProfile[] = fetched.map(voice => ({ id: voice.id, name: voice.label }));
                const list = [...mapped];
                if (agent.voice && !list.some(v => v.id === agent.voice)) {
                    list.push({ id: agent.voice, name: 'Current Voice' });
                }
                setVoices(list.length > 0 ? list : [...AVAILABLE_VOICES]);
            } catch (error) {
                console.error('[AgentDossierModal] Failed to load ElevenLabs voices', error);
            }
        })();
        return () => {
            isMounted = false;
        };
    }, [agent.voice]);

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
                        {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
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

const LedgerAndReportTab = ({ agentId }: { agentId: string }) => {
    const [summary, setSummary] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { tradeHistory } = useArenaStore();
    const { availablePersonal, availablePresets } = useAgent();

    const allAgents = useMemo(() => new Map([...availablePersonal, ...availablePresets].map(a => [a.id, a])), [availablePersonal, availablePresets]);

    useEffect(() => {
        const fetchActivity = async () => {
            setIsLoading(true);
            try {
                // We only need the AI summary from this endpoint now
                const { summary } = await apiService.getAgentActivitySummary(agentId);
                setSummary(summary);
            } catch (error) {
                console.error('Failed to fetch agent activity summary', error);
                setSummary('Could not load AI-generated activity report.');
            }
            setIsLoading(false);
        };
        fetchActivity();
    }, [agentId]);
    
    const personalTradeHistory = useMemo(() => {
        return tradeHistory
            .filter(trade => trade.fromId === agentId || trade.toId === agentId)
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [tradeHistory, agentId]);

    if (isLoading) {
        return <p>Loading agent report...</p>;
    }

    return (
        <div className={styles.activityLogContainer}>
            <div className={styles.activitySummaryCard}>
                <h4>AI Daily Report</h4>
                <blockquote className={styles.summaryText}>{summary || 'No summary available.'}</blockquote>
            </div>

            <div className={styles.personalLedger}>
                <h4>Transaction Ledger</h4>
                {personalTradeHistory.length === 0 ? (
                    <p className={styles.emptyLedger}>No trades recorded yet.</p>
                ) : (
                    <table className={styles.ledgerTable}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Action</th>
                                <th>Asset</th>
                                <th>Amount</th>
                                <th>Counterparty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {personalTradeHistory.map(trade => {
                                const isBuy = trade.toId === agentId;
                                const counterpartyId = isBuy ? trade.fromId : trade.toId;
                                const counterparty = allAgents.get(counterpartyId);
                                
                                return (
                                    <tr key={trade.timestamp}>
                                        <td>{format(trade.timestamp, 'MMM d, h:mm a')}</td>
                                        <td>
                                            <span className={isBuy ? styles.actionBuy : styles.actionSell}>
                                                {isBuy ? 'BUY' : 'SELL'}
                                            </span>
                                        </td>
                                        <td className={styles.tokenCell}>{trade.type === 'intel' ? `Intel on $${trade.token}` : `$${trade.token}`}</td>
                                        <td className={styles.priceCell}>{trade.type === 'token' ? `${trade.quantity.toLocaleString()} @` : ''} {trade.price.toLocaleString()} BOX</td>
                                        <td>{counterparty?.name || 'Unknown'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

const PortfolioTab = ({ agent }: { agent: Agent }) => {
    const portfolioItems = Object.entries(agent.portfolio || {});

    return (
        <div className={styles.portfolioContainer}>
            <div className={styles.portfolioSummary}>
                <div className={styles.balanceCard}>
                    <span className={styles.balanceLabel}>BOX Balance</span>
                    <span className={styles.balanceValue}>{agent.boxBalance.toLocaleString()}</span>
                </div>
            </div>
            <h4>Token Holdings</h4>
            {portfolioItems.length === 0 ? (
                <p className={styles.emptyLedger}>No tokens held in portfolio.</p>
            ) : (
                 <table className={styles.ledgerTable}>
                    <thead>
                        <tr>
                            <th>Token</th>
                            <th>Quantity</th>
                            <th>Current Value (USD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {portfolioItems.map(([token, quantity]) => (
                            <tr key={token}>
                                <td className={styles.tokenCell}>${token}</td>
                                <td>{quantity.toLocaleString()}</td>
                                <td>-</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

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
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'portfolio' })} onClick={() => setActiveTab('portfolio')} disabled={isCreatingAgentInDossier}>Portfolio</button>
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'activity' })} onClick={() => setActiveTab('activity')} disabled={isCreatingAgentInDossier}>Ledger & Report</button>
                </div>
                <div className={styles.modalContent}>
                    {activeTab === 'profile' && <ProfileTab agent={formData} onUpdate={(updates) => setFormData(prev => prev ? {...prev, ...updates} : null)} onSave={handleSave} />}
                    {activeTab === 'portfolio' && <PortfolioTab agent={formData} />}
                    {activeTab === 'activity' && <LedgerAndReportTab agentId={formData.id} />}
                </div>
            </div>
        </Modal>
    );
}