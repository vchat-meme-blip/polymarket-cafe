
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import Modal from '../Modal';
import { useUI, useAgent } from '../../lib/state/index.js';
import { useAutonomyStore } from '../../lib/state/autonomy.js';
import { apiService } from '../../lib/services/api.service.js';
import { AgentTask } from '../../lib/types/index.js';
import styles from './CreateTaskModal.module.css';
import { WHALE_WALLETS } from '../../lib/presets/agents.js';

type TaskType = 'one_time_research' | 'continuous_monitoring';
type MonitoringTarget = 'market_odds' | 'liquidity' | 'whale_wallet' | 'breaking_markets';

export default function CreateTaskModal() {
    const { closeCreateTaskModal, addToast } = useUI();
    const { current: currentAgent } = useAgent();
    const { addTask } = useAutonomyStore();

    const [taskType, setTaskType] = useState<TaskType>('one_time_research');
    const [topic, setTopic] = useState('');
    const [monitoringTarget, setMonitoringTarget] = useState<MonitoringTarget>('market_odds');
    const [targetIdentifier, setTargetIdentifier] = useState('');

    const [isCreating, setIsCreating] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const isMonitoring = taskType === 'continuous_monitoring';
        const needsIdentifier = isMonitoring && monitoringTarget !== 'breaking_markets';

        if (needsIdentifier && !targetIdentifier) {
            addToast({ type: 'error', message: 'A target is required for this monitoring task.' });
            return;
        }
        if (!isMonitoring && !topic.trim()) {
            addToast({ type: 'error', message: 'A topic is required for research tasks.' });
            return;
        }

        setIsCreating(true);

        let objective = '';
        let parameters: AgentTask['parameters'] = {};

        if (isMonitoring) {
            parameters = { monitoringTarget, targetIdentifier: monitoringTarget === 'breaking_markets' ? '*' : targetIdentifier };
            if (monitoringTarget === 'market_odds') {
                objective = `Continuously monitor odds for market: "${targetIdentifier}"`;
            } else if (monitoringTarget === 'liquidity') {
                objective = `Continuously monitor liquidity for market: "${targetIdentifier}"`;
            } else if (monitoringTarget === 'whale_wallet') {
                const whaleName = WHALE_WALLETS.find(w => w.address === targetIdentifier)?.name || 'Unknown Trader';
                objective = `Continuously monitor trades for: ${whaleName}`;
            } else if (monitoringTarget === 'breaking_markets') {
                objective = `Continuously monitor for new breaking markets.`;
            }
        } else {
            objective = `Conduct a one-time research report on "${topic}"`;
            parameters = { topic };
        }

        const taskData: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'updates'> = {
            agentId: currentAgent.id,
            type: taskType,
            objective,
            parameters,
            status: 'in_progress', // Start monitoring tasks immediately
        };

        try {
            const newTask = await apiService.createTask(currentAgent.id, taskData);
            addTask(newTask);
            addToast({ type: 'system', message: 'New task assigned to your agent.' });
            closeCreateTaskModal();
        } catch (error) {
            console.error('Failed to create task', error);
            addToast({ type: 'error', message: 'Failed to create task. Please try again.' });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Modal onClose={closeCreateTaskModal}>
            <div className={`${styles.modalContentPane} ${styles.createTaskModal}`}>
                <h2>Assign New Task</h2>
                <p>Give your active agent, {currentAgent.name}, a new objective.</p>
                <form onSubmit={handleSubmit} className={styles.createTaskForm}>
                    <div className="formGroup">
                        <label>Task Type</label>
                        <select value={taskType} onChange={e => setTaskType(e.target.value as TaskType)} disabled={isCreating}>
                            <option value="one_time_research">One-Time Research Report</option>
                            <option value="continuous_monitoring">Continuous Monitoring</option>
                        </select>
                    </div>

                    {taskType === 'one_time_research' ? (
                        <div className="formGroup">
                            <label htmlFor="topic">Topic / Keywords</label>
                            <textarea
                                id="topic"
                                rows={3}
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="e.g., The upcoming Ethereum ETF decision"
                                required
                                disabled={isCreating}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="formGroup">
                                <label>Monitoring Target</label>
                                <select value={monitoringTarget} onChange={e => { setMonitoringTarget(e.target.value as MonitoringTarget); setTargetIdentifier(''); }} disabled={isCreating}>
                                    <option value="market_odds">Market Odds</option>
                                    <option value="liquidity">Market Liquidity</option>
                                    <option value="whale_wallet">Top Trader Wallet</option>
                                    <option value="breaking_markets">New Breaking Markets</option>
                                </select>
                            </div>
                             {(monitoringTarget === 'market_odds' || monitoringTarget === 'liquidity') && (
                                <div className="formGroup">
                                    <label>Market Slug</label>
                                    <input type="text" value={targetIdentifier} onChange={e => setTargetIdentifier(e.target.value)} required placeholder="e.g., trump-wins-2024" />
                                </div>
                            )}
                            {monitoringTarget === 'whale_wallet' && (
                                <div className="formGroup">
                                    <label>Trader to Watch</label>
                                    <select value={targetIdentifier} onChange={e => setTargetIdentifier(e.target.value)} required>
                                        <option value="">-- Select a Trader --</option>
                                        {WHALE_WALLETS.map(w => <option key={w.address} value={w.address}>{w.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {monitoringTarget === 'breaking_markets' && (
                                <p className='stepHint'>The agent will monitor for any new markets categorized as "Breaking" on Polymarket.</p>
                            )}
                        </>
                    )}
                    
                    <button type="submit" className="button primary" disabled={isCreating}>
                        {isCreating ? 'Assigning...' : 'Assign Task'}
                    </button>
                </form>
            </div>
        </Modal>
    );
}
