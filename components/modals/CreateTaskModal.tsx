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

export default function CreateTaskModal() {
    const { closeCreateTaskModal, addToast } = useUI();
    const { current: currentAgent } = useAgent();
    const { addTask } = useAutonomyStore();

    const [taskType, setTaskType] = useState<'one_time_research' | 'continuous_monitoring'>('one_time_research');
    const [topic, setTopic] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!topic.trim()) {
            addToast({ type: 'error', message: 'A topic is required for the task.' });
            return;
        }
        setIsCreating(true);

        const taskData: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'updates'> = {
            agentId: currentAgent.id,
            type: taskType,
            objective: taskType === 'one_time_research' 
                ? `Conduct a one-time research report on "${topic}"`
                : `Continuously monitor news and opportunities related to "${topic}"`,
            parameters: { topic },
            status: 'pending',
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
                        <select value={taskType} onChange={e => setTaskType(e.target.value as any)} disabled={isCreating}>
                            <option value="one_time_research">One-Time Research Report</option>
                            <option value="continuous_monitoring">Continuous Monitoring</option>
                        </select>
                    </div>
                    <div className="formGroup">
                        <label htmlFor="topic">Topic / Keywords</label>
                        <textarea
                            id="topic"
                            rows={3}
                            value={topic}
                            onChange={e => setTopic(e.target.value)}
                            placeholder={
                                taskType === 'one_time_research'
                                ? "e.g., The upcoming Ethereum ETF decision"
                                : "e.g., Breaking news on sports markets"
                            }
                            required
                            disabled={isCreating}
                        />
                    </div>
                    <button type="submit" className="button primary" disabled={isCreating}>
                        {isCreating ? 'Assigning...' : 'Assign Task'}
                    </button>
                </form>
            </div>
        </Modal>
    );
}