/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import Modal from '../Modal';
import { useUI, useAutonomyStore, useAgent } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './Modals.module.css';

export default function CreateTaskModal() {
    const { closeCreateTaskModal } = useUI();
    const { addTask } = useAutonomyStore();
    const { current: agent } = useAgent();
    const [objective, setObjective] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!objective.trim()) return;

        setIsSaving(true);
        try {
            // A simplified task creation logic. In a real app, this would be more complex.
            const newTask = await apiService.createTask(agent.id, {
                objective,
                type: 'research_topic', // Defaulting to a general research type
                parameters: { keywords: objective },
                status: 'pending',
            });
            addTask(newTask);
            closeCreateTaskModal();
        } catch (error) {
            console.error("Failed to create task:", error);
            // In a real app, show a toast notification on error
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal onClose={closeCreateTaskModal}>
            <div className={`${styles.modalContentPane} ${styles.createTaskModal}`}>
                <h2>Assign New Task</h2>
                <p>Give your agent a new objective to work on autonomously.</p>
                <form onSubmit={handleSubmit} className={styles.createTaskForm}>
                    <label>
                        <span>Objective</span>
                        <textarea
                            rows={4}
                            value={objective}
                            onChange={(e) => setObjective(e.target.value)}
                            placeholder="e.g., 'Keep an eye on breaking sports markets and notify me of good opportunities.'"
                            required
                            disabled={isSaving}
                        />
                    </label>
                    <button type="submit" className="button primary" style={{justifyContent: 'center'}} disabled={isSaving}>
                        {isSaving ? 'Assigning...' : 'Assign Task'}
                    </button>
                </form>
            </div>
        </Modal>
    );
}