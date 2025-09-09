/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { useAgent, useUI, useUser, createNewAgent } from '../../lib/state';
import { Agent, INTERLOCUTOR_VOICES, PRESET_AGENTS } from '../../lib/presets/agents';
import { apiService } from '../../lib/services/api.service';
import { VrmAvatarCanvas } from '../agents/VrmAvatar';
import { formatDistanceToNow } from 'date-fns';
import c from 'classnames';
import styles from './Modals.module.css';

const ProfileTab = ({ agent, onUpdate, onSave }: { agent: Agent, onUpdate: (updates: Partial<Agent>) => void, onSave: () => void }) => {
    const [isBrainstorming, setIsBrainstorming] = useState(false);
    const [personalityKeywords, setPersonalityKeywords] = useState('');

    const handleBrainstorm = async () => {
        if (!personalityKeywords.trim()) return;
        setIsBrainstorming(true);
        try {
            const response = await fetch('/api/brainstorm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keywords: personalityKeywords }),
            });
            if (!response.ok) {
                throw new Error('Brainstorm request failed');
            }
            const data = await response.json();
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
                    <VrmAvatarCanvas modelUrl={agent.modelUrl || ''} isSpeaking={false} />
                </div>
                 <label>
                    <span>3D Model</span>
                    <select value={agent.modelUrl} onChange={e => onUpdate({ modelUrl: e.target.value })}>
                        {PRESET_AGENTS.map(p => <option key={p.id} value={p.modelUrl}>{p.name}</option>)}
                    </select>
                </label>
                <label>
                    <span>Voice</span>
                    <select value={agent.voice} onChange={e => onUpdate({ voice: e.target.value as any })}>
                        {INTERLOCUTOR_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
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
                    <textarea value={agent.personality} onChange={e => onUpdate({ personality: e.target.value })} rows={6} />
                </label>
                 <button type="submit" className="button primary" style={{justifyContent: 'center'}}>Save Changes</button>
            </div>
        </form>
    );
};

const ActivityLogTab = ({ agentId }: { agentId: string }) => {
    const [activity, setActivity] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchActivity = async () => {
            setIsLoading(true);
            try {
                const data = await apiService.getAgentActivity(agentId);
                setActivity(data);
            } catch (error) {
                console.error('Failed to fetch agent activity', error);
            }
            setIsLoading(false);
        };
        fetchActivity();
    }, [agentId]);

    return (
        <div className={styles.activityLog}>
            {isLoading ? <p>Loading activity...</p> : activity.length === 0 ? <p>No activity recorded yet.</p> : (
                activity.map(log => (
                    <div key={log._id} className={styles.activityItem}>
                        <span className={styles.activityTimestamp}>{formatDistanceToNow(log.timestamp, { addSuffix: true })}</span>
                        <span className={styles.activityType}>{log.type}</span>
                        <p className={styles.activityDescription}>{log.description}</p>
                    </div>
                ))
            )}
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
        if (isCreatingAgentInDossier) {
            const finalAgent = { ...formData, ownerHandle: handle };
            await apiService.saveNewAgent(finalAgent as Agent);
        } else {
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
                    <button className={c(styles.tabButton, { [styles.active]: activeTab === 'activity' })} onClick={() => setActiveTab('activity')}>Activity Log</button>
                </div>
                <div className={styles.modalContent}>
                    {activeTab === 'profile' && <ProfileTab agent={formData} onUpdate={(updates) => setFormData(prev => prev ? {...prev, ...updates} : null)} onSave={handleSave} />}
                    {activeTab === 'activity' && <ActivityLogTab agentId={formData.id} />}
                </div>
            </div>
        </Modal>
    );
}