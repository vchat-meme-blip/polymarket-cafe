/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState, useMemo, FormEvent } from 'react';
import Modal from '../Modal';
import { useAgent, useUI, useUser, createNewAgent } from '../../lib/state/index.js';
import { Agent, BettingIntel, MarketWatchlist } from '../../lib/types/index.js';
import { AVAILABLE_VOICES, PRESET_AGENTS, VoiceProfile } from '../../lib/presets/agents';
import { apiService } from '../../lib/services/api.service.js';
import { VrmModel } from '../agents/VrmAvatar';
// FIX: Changed to default import from submodule to resolve module resolution error.
import { format } from 'date-fns';
import c from 'classnames';
import styles from './Modals.module.css';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useArenaStore } from '../../lib/state/arena.js';
import { ttsService } from '../../lib/services/tts.service.js';
import { useAutonomyStore } from '../../lib/state/autonomy.js';

type DossierTab = 'profile' | 'intel' | 'operations' | 'activity';

const ProfileTab = ({ agent, onUpdate, onSave }: { agent: Partial<Agent>, onUpdate: (updates: Partial<Agent>) => void, onSave: () => void }) => {
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
                            camera={{ position: [0, 1.0, 2.5], fov: 40 }}
                            gl={{ antialias: true, alpha: true }}
                            shadows
                        >
                            <ambientLight intensity={1.5} />
                            <directionalLight position={[3, 1, 2]} intensity={2} castShadow />
                            <group position={[0, -1.0, 0]} rotation={[0, agent.modelUrl?.includes('war_boudica') ? 0.2 : (0.2 + Math.PI), 0]} scale={1.0}>
                                <VrmModel 
                                    modelUrl={agent.modelUrl || ''} 
                                    isSpeaking={false}
                                    disableAutoGrounding={false}
                                />
                            </group>
                            <OrbitControls
                                enableZoom={false}
                                enablePan={false}
                                target={[0, 0.5, 0]}
                            />
                        </Canvas>
                    </div>
                </div>
                 <label>
                    <span>3D Model</span>
                    <select 
                        value={agent.modelUrl} 
                        onChange={e => {
                            const selectedPreset = PRESET_AGENTS.find(p => p.modelUrl === e.target.value);
                            if (selectedPreset) {
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

const OperationsTab = ({ agent, onUpdate }: { agent: Partial<Agent>, onUpdate: (updates: Partial<Agent>) => void }) => {
    return (
        <div className={styles.operationsContainer}>
            <h4>Autonomous Behavior Configuration</h4>
            <p>Set rules for how this agent operates on its own.</p>
            <div className={styles.operationsForm}>
                <div className={styles.shillSection}>
                    <label 
                        htmlFor={`proactive-toggle-${agent.id}`}
                        title="If enabled, this agent will occasionally send you unsolicited messages with market analysis or other insights when you are on the Dashboard."
                    >
                        Enable Proactive Insights
                    </label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            checked={agent.isProactive} 
                            onChange={e => onUpdate({ isProactive: e.target.checked })}
                            id={`proactive-toggle-${agent.id}`}
                        />
                        <label htmlFor={`proactive-toggle-${agent.id}`}></label>
                    </div>
                </div>
                <label title="If filled, this agent will only visit these specific storefronts to buy intel. Leave blank to allow it to visit random storefronts.">
                    <span>Trusted Intel Storefronts (Room IDs)</span>
                    <textarea 
                        rows={3} 
                        placeholder="e.g., room-abc12, room-xyz34"
                        value={agent.trustedRoomIds?.join(', ') || ''}
                        onChange={(e) => onUpdate({ trustedRoomIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    />
                </label>
                <label title="Define when this agent should be active if they are hosting an owned storefront. (Parsing is very basic for now).">
                    <span>Operating Hours (for owned rooms)</span>
                    <input 
                        type="text" 
                        placeholder="e.g., Weekdays 9-17 UTC" 
                        value={agent.operatingHours || ''}
                        onChange={(e) => onUpdate({ operatingHours: e.target.value })}
                    />
                </label>
            </div>
        </div>
    );
};

const LedgerAndReportTab = ({ agentId }: { agentId: string }) => {
    const [summary, setSummary] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { tradeHistory } = useArenaStore();
    const { availablePersonal, availablePresets } = useAgent();
    const { ownedRoomId } = useUser();

    const allAgents = useMemo(() => new Map([...availablePersonal, ...availablePresets].map(a => [a.id, a])), [availablePersonal, availablePresets]);

    useEffect(() => {
        const fetchActivity = async () => {
            setIsLoading(true);
            try {
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

    const storefrontTradeHistory = useMemo(() => {
        if (!ownedRoomId) return [];
        return tradeHistory
            .filter(trade => trade.roomId === ownedRoomId)
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [tradeHistory, ownedRoomId]);

    const storefrontPnl = useMemo(() => {
        return storefrontTradeHistory.reduce((total, trade) => {
            return total + trade.price;
        }, 0);
    }, [storefrontTradeHistory]);

    if (isLoading) {
        return <p>Loading agent report...</p>;
    }

    return (
        <div className={styles.activityLogContainer}>
            <div className={styles.activitySummaryCard}>
                <h4>AI Daily Report</h4>
                <blockquote className={styles.summaryText}>{summary || 'No summary available.'}</blockquote>
            </div>

            {ownedRoomId && (
                 <div className={styles.storefrontLedger}>
                    <h4>Storefront Ledger (Total PNL: {storefrontPnl.toLocaleString()} BOX)</h4>
                    {storefrontTradeHistory.length === 0 ? (
                        <p className={styles.emptyLedger}>No trades recorded in your storefront yet.</p>
                    ) : (
                         <table className={styles.ledgerTable}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Asset</th>
                                    <th>Price</th>
                                    <th>Buyer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {storefrontTradeHistory.map(trade => {
                                    const buyer = allAgents.get(trade.toId);
                                    return (
                                        <tr key={trade.timestamp}>
                                            {/* FIX: Wrap timestamp in new Date() as required by date-fns format function. */}
                                            <td>{format(new Date(trade.timestamp), 'MMM d, h:mm a')}</td>
                                            <td className={styles.tokenCell}>{`Intel on ${trade.market}`}</td>
                                            <td className={styles.priceCell}>{trade.price.toLocaleString()} BOX</td>
                                            <td>{buyer?.name || 'Unknown'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            <div className={styles.personalLedger}>
                <h4>Intel Trade Ledger</h4>
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
                                        {/* FIX: Wrap timestamp in new Date() as required by date-fns format function. */}
                                        <td>{format(new Date(trade.timestamp), 'MMM d, h:mm a')}</td>
                                        <td>
                                            <span className={isBuy ? styles.actionBuy : styles.actionSell}>
                                                {isBuy ? 'BUY' : 'SELL'}
                                            </span>
                                        </td>
                                        <td className={styles.tokenCell}>{`Intel on ${trade.market}`}</td>
                                        <td className={styles.priceCell}>{trade.price.toLocaleString()} BOX</td>
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

const IntelBriefingTab = ({ agent, onUpdate }: { agent: Partial<Agent>, onUpdate: (updates: Partial<Agent>) => void }) => {
    const { addToast } = useUI();
    const [isSavingIntel, setIsSavingIntel] = useState(false);
    const [isSavingWatchlist, setIsSavingWatchlist] = useState(false);

    // State for BettingIntel form
    const [market, setMarket] = useState('');
    const [content, setContent] = useState('');
    const [source, setSource] = useState('');
    const [isIntelTradable, setIsIntelTradable] = useState(false);
    
    // State for MarketWatchlist form
    const [watchlistName, setWatchlistName] = useState('');
    const [watchlistMarkets, setWatchlistMarkets] = useState('');
    const [watchlistPrice, setWatchlistPrice] = useState(50);

    const agentIntel = useMemo(() => {
        return useAutonomyStore.getState().intelBank
            .filter(i => (i as any).ownerHandle === agent.ownerHandle)
            .sort((a, b) => b.createdAt - a.createdAt);
    }, [agent.ownerHandle]);

    const handleIntelSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!market.trim() || !content.trim()) {
            addToast({ type: 'error', message: 'Market and Intel content are required.' });
            return;
        }
        setIsSavingIntel(true);
        try {
            await apiService.addBettingIntel(agent.id!, {
                market,
                content,
                sourceDescription: source,
                isTradable: isIntelTradable,
            });
            addToast({ type: 'system', message: 'Intel successfully briefed to agent.' });
            setMarket('');
            setContent('');
            setSource('');
            setIsIntelTradable(false);
        } catch (error) {
            console.error("Failed to save intel", error);
            addToast({ type: 'error', message: 'Failed to save intel. Please try again.' });
        } finally {
            setIsSavingIntel(false);
        }
    };
    
    const handleWatchlistSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!watchlistName.trim() || !watchlistMarkets.trim()) {
            addToast({ type: 'error', message: 'Watchlist name and markets are required.' });
            return;
        }
        setIsSavingWatchlist(true);
        try {
            const newWatchlist: Omit<MarketWatchlist, 'id' | 'createdAt'> = {
                name: watchlistName,
                markets: watchlistMarkets.split(',').map(m => m.trim()).filter(Boolean),
                isTradable: true,
                price: watchlistPrice
            };
            const { watchlist: savedWatchlist } = await apiService.addMarketWatchlist(agent.id!, newWatchlist);
            onUpdate({ marketWatchlists: [...(agent.marketWatchlists || []), savedWatchlist] });
            addToast({ type: 'system', message: 'Watchlist created successfully.' });
            setWatchlistName('');
            setWatchlistMarkets('');
            setWatchlistPrice(50);
        } catch (error) {
            console.error("Failed to save watchlist", error);
            addToast({ type: 'error', message: 'Failed to save watchlist.' });
        } finally {
            setIsSavingWatchlist(false);
        }
    };

    const handleDeleteWatchlist = async (watchlistId: string) => {
        if (!window.confirm("Are you sure you want to delete this watchlist?")) return;
        try {
            await apiService.deleteMarketWatchlist(agent.id!, watchlistId);
            onUpdate({ marketWatchlists: agent.marketWatchlists?.filter(w => w.id !== watchlistId) });
            addToast({ type: 'system', message: 'Watchlist deleted.' });
        } catch (error) {
            console.error("Failed to delete watchlist", error);
            addToast({ type: 'error', message: 'Failed to delete watchlist.' });
        }
    };

    return (
        <div className={styles.intelBriefingContainer}>
            <h4>Manage Tradable Watchlists</h4>
            <p>Create and price market watchlists for your agent to sell in their storefront.</p>
            <form onSubmit={handleWatchlistSubmit} className={styles.intelBriefingForm}>
                <label>
                    <span>Watchlist Name</span>
                    <input type="text" placeholder="e.g., 'Q4 Tech Earnings Plays'" value={watchlistName} onChange={(e) => setWatchlistName(e.target.value)} disabled={isSavingWatchlist} />
                </label>
                <label>
                    <span>Market Slugs (comma-separated)</span>
                    <textarea rows={3} placeholder="e.g., trump-wins-2024, btc-70k-eoy" value={watchlistMarkets} onChange={(e) => setWatchlistMarkets(e.target.value)} disabled={isSavingWatchlist}></textarea>
                </label>
                <label>
                    <span>Price (BOX)</span>
                    <input type="number" value={watchlistPrice} onChange={(e) => setWatchlistPrice(Number(e.target.value))} min="1" disabled={isSavingWatchlist} />
                </label>
                <button type="submit" className="button primary" disabled={isSavingWatchlist}>
                    {isSavingWatchlist ? 'Saving...' : 'Create Watchlist'}
                </button>
            </form>

            <div className={styles.intelBriefingDivider}></div>
            <h4>Agent's Watchlists ({agent.marketWatchlists?.length || 0})</h4>
             <div className={styles.intelOwnedList}>
                {agent.marketWatchlists && agent.marketWatchlists.length > 0 ? (
                    agent.marketWatchlists.map(list => (
                        <div key={list.id} className={styles.intelOwnedItem}>
                            <div className={styles.intelOwnedHeader}>
                                <strong>{list.name}</strong>
                                <button onClick={() => handleDeleteWatchlist(list.id)} className={styles.deleteButton} title="Delete Watchlist">
                                    <span className="icon">delete</span>
                                </button>
                            </div>
                            <p>{list.markets.join(', ')}</p>
                            <div className={styles.intelOwnedStats}>
                                <span>Price: {list.price} BOX</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className={styles.emptyLedger}>No watchlists created yet.</p>
                )}
            </div>
            
             <div className={styles.intelBriefingDivider}></div>
             <h4>Brief with Alpha Snippet</h4>
             {/* ...existing BettingIntel form... */}
        </div>
    );
};


export default function AgentDossierModal({ agentId }: { agentId: string }) {
    const { closeAgentDossier, isCreatingAgentInDossier } = useUI();
    const { availablePersonal, addAgent, update } = useAgent();
    const { handle } = useUser();
    
    const [activeTab, setActiveTab] = useState<DossierTab>('profile');
    const [isSaving, setIsSaving] = useState(false);

    const initialAgentData = useMemo(() => {
        return availablePersonal.find(a => a.id === agentId) || 
               (isCreatingAgentInDossier ? createNewAgent({ id: agentId }) : null);
    }, [agentId, availablePersonal, isCreatingAgentInDossier]);
                             
    const [formData, setFormData] = useState<Partial<Agent> | null>(initialAgentData);

    useEffect(() => {
        setFormData(initialAgentData);
    }, [initialAgentData]);

    if (!formData) {
        console.error("Dossier opened for a non-existent agent!");
        closeAgentDossier();
        return null;
    }
    
    const handleSave = async () => {
        setIsSaving(true);
    
        if (isCreatingAgentInDossier) {
            const agentToCreate = { ...formData, ownerHandle: handle };
            try {
                const { agent: savedAgent } = await apiService.saveNewAgent(agentToCreate);
                addAgent(savedAgent);
            } catch (error) {
                console.error('Failed to create agent:', error);
            }
        } else {
            if (!formData.id) {
                console.error("Cannot update agent without an ID.");
                setIsSaving(false);
                return;
            }
            update(formData.id, formData);
            await apiService.updateAgent(formData.id, formData);
        }
    
        setIsSaving(false);
        closeAgentDossier();
    };

    const onUpdate = (updates: Partial<Agent>) => {
        setFormData(prev => prev ? {...prev, ...updates} : null)
    };

    return (
        <Modal onClose={closeAgentDossier}>
            <div className={styles.profileView}>
                 <div className={styles.modalHeader}>
                    <h2>Agent Dossier: {formData.name || 'New Quant'}</h2>
                </div>
                <div className={styles.modalTabs}>
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'profile' })} onClick={() => setActiveTab('profile')}>Profile</button>
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'intel' })} onClick={() => setActiveTab('intel')}>Intel Briefing</button>
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'operations' })} onClick={() => setActiveTab('operations')}>Operations</button>
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'activity' })} onClick={() => setActiveTab('activity')} disabled={isCreatingAgentInDossier}>Ledger & Report</button>
                </div>
                <div className={styles.modalContent}>
                    {activeTab === 'profile' && <ProfileTab agent={formData as Agent} onUpdate={(updates) => setFormData(prev => prev ? {...prev, ...updates} : null)} onSave={handleSave} />}
                    {activeTab === 'intel' && <IntelBriefingTab agent={formData} onUpdate={onUpdate} />}
                    {activeTab === 'operations' && <OperationsTab agent={formData} onUpdate={(updates) => setFormData(prev => prev ? {...prev, ...updates} : null)} />}
                    {activeTab === 'activity' && <LedgerAndReportTab agentId={formData.id!} />}
                </div>
            </div>
        </Modal>
    );
};