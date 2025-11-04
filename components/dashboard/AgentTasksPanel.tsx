/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect } from 'react';
import { useUI, useAgent } from '../../lib/state/index.js';
import { useAutonomyStore } from '../../lib/state/autonomy.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './Dashboard.module.css';
import { AgentTask } from '../../lib/types/index.js';
import { formatDistanceToNow } from 'date-fns';

const TaskItem = ({ task }: { task: AgentTask }) => {
    return (
        <div className={styles.taskItem}>
            <details>
                <summary>
                    <span className={styles.taskObjective}>{task.objective}</span>
                    <span className={`${styles.taskStatus} ${styles[task.status]}`}>
                        {task.status.replace('_', ' ')}
                    </span>
                </summary>
                <div className={styles.taskUpdates}>
                    <p><strong>Last Updated:</strong> {formatDistanceToNow(task.updatedAt, { addSuffix: true })}</p>
                    {task.updates.length > 0 && (
                        <ul>
                            {task.updates.map((update, i) => <li key={i}>{update}</li>)}
                        </ul>
                    )}
                </div>
            </details>
        </div>
    );
};

export default function AgentTasksPanel() {
    const { openCreateTaskModal } = useUI();
    const { current: currentAgent } = useAgent();
    const { tasks, setTasks } = useAutonomyStore();

    useEffect(() => {
        const fetchTasks = async () => {
            try {
                const fetchedTasks = await apiService.getTasks(currentAgent.id);
                setTasks(fetchedTasks);
            } catch (error) {
                console.error("Failed to fetch agent tasks:", error);
            }
        };
        fetchTasks();
    }, [currentAgent.id, setTasks]);

    return (
        <div className={`${styles.dashboardPanel} ${styles.agentTasksPanel}`}>
            <div className={styles.tasksHeader}>
                <h3 className={styles.dashboardPanelTitle}>
                    <span className="icon">task_alt</span>
                    Agent Tasks
                </h3>
                <button className="button" onClick={openCreateTaskModal}>
                    <span className="icon">add</span> New Task
                </button>
            </div>
            <div className={styles.taskList}>
                {tasks.length > 0 ? (
                    tasks.map(task => <TaskItem key={task.id} task={task} />)
                ) : (
                    <div className={styles.emptyTasks}>
                        <p>No active tasks. Give your agent a mission!</p>
                    </div>
                )}
            </div>
        </div>
    );
}