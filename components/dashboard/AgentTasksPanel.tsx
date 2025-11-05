/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect } from 'react';
import { useUI, useAgent } from '../../lib/state/index.js';
import { useAutonomyStore } from '../../lib/state/autonomy.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './AgentTasksPanel.module.css';
import { AgentTask } from '../../lib/types/index.js';
import { formatDistanceToNow } from 'date-fns';

const TaskItem = ({ task }: { task: AgentTask }) => {
    const { openTaskDetailModal } = useUI();
    return (
        <div className={styles.taskItem}>
            <div className={styles.taskItemHeader}>
                <span className={styles.taskObjective}>{task.objective}</span>
                <span className={`${styles.taskStatus} ${styles[task.status]}`}>
                    {task.status.replace('_', ' ')}
                </span>
            </div>
            <div className={styles.taskItemFooter}>
                <span className={styles.taskTime}>Updated {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}</span>
                <button className="button secondary" onClick={() => openTaskDetailModal(task)}>
                    <span className="icon">manage_history</span> Manage
                </button>
            </div>
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
        if (currentAgent.id) {
            fetchTasks();
        }
    }, [currentAgent.id, setTasks]);

    return (
        <div className={styles.agentTasksPanel}>
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
                {tasks && tasks.length > 0 ? (
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
