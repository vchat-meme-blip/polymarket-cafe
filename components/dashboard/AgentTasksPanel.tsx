/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect } from 'react';
import { useAutonomyStore, useAgent, useUI } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import { AgentTask } from '../../lib/types/index.js';
import styles from './Dashboard.module.css';

const TaskItem = ({ task }: { task: AgentTask }) => (
    <div className={styles.taskItem}>
        <details>
            <summary>
                <span className={styles.taskObjective}>{task.objective}</span>
                <span className={`${styles.taskStatus} ${styles[task.status]}`}>
                    {task.status.replace('_', ' ')}
                </span>
            </summary>
            <div className={styles.taskUpdates}>
                {task.updates.length > 0 ? (
                    <ul>
                        {task.updates.slice(-3).map((update, i) => <li key={i}>{update}</li>)}
                    </ul>
                ) : <p>No updates yet.</p>}
            </div>
        </details>
    </div>
);

export default function AgentTasksPanel() {
    const { tasks, setTasks } = useAutonomyStore();
    const { current: agent } = useAgent();
    const { openCreateTaskModal } = useUI();

    useEffect(() => {
        const fetchTasks = async () => {
            try {
                const fetchedTasks = await apiService.getTasks(agent.id);
                setTasks(fetchedTasks);
            } catch (error) {
                console.error("Failed to fetch agent tasks", error);
            }
        };

        fetchTasks();
    }, [agent.id, setTasks]);

    return (
        <div className={`${styles.dashboardPanel} ${styles.agentTasksPanel}`}>
            <div className={styles.tasksHeader}>
                <h3 className={styles.dashboardPanelTitle}>
                    <span className="icon">assignment</span>
                    Agent Tasks
                </h3>
                <button className="button primary" onClick={openCreateTaskModal}>
                    <span className="icon">add</span> New Task
                </button>
            </div>
            <div className={styles.taskList}>
                {tasks.length > 0 ? (
                    tasks.map(task => <TaskItem key={task.id} task={task} />)
                ) : (
                    <div className={styles.emptyTasks}>
                        <p>No tasks assigned. Give your agent a mission!</p>
                    </div>
                )}
            </div>
        </div>
    );
}