
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import Modal from '../Modal';
import { useUI } from '../../lib/state/index.js';
import { useAutonomyStore } from '../../lib/state/autonomy';
import { AgentTask } from '../../lib/types/index.js';
import styles from './TaskDetailModal.module.css';
import { format } from 'date-fns';

export default function TaskDetailModal({ task }: { task: AgentTask }) {
    const { closeTaskDetailModal } = useUI();
    const { deleteTask } = useAutonomyStore();

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
            try {
                await deleteTask(task.id);
                closeTaskDetailModal();
            } catch (error) {
                console.error("Failed to delete task:", error);
                alert('There was an error deleting the task.');
            }
        }
    };

    return (
        <Modal onClose={closeTaskDetailModal}>
            <div className={`${styles.modalContentPane} ${styles.taskDetailModal}`}>
                <h2>Task Details</h2>
                <p>{task.objective}</p>
                <span className={`${styles.status} ${styles[task.status]}`}>
                    {task.status.replace('_', ' ')}
                </span>

                {task.result && (
                    <div className={styles.detailSection}>
                        <h4>Final Report</h4>
                        <p className={styles.summaryText}>{task.result.summary}</p>
                    </div>
                )}
                
                {task.sources && task.sources.length > 0 && (
                     <div className={styles.detailSection}>
                        <h4>Research Sources</h4>
                        <div className={styles.sourcesList}>
                            {task.sources.map((source, index) => (
                                <a href={source.url} key={index} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                                    <span className="icon">link</span>
                                    {source.title || source.url}
                                </a>
                            ))}
                        </div>
                    </div>
                )}
                
                {task.type === 'continuous_monitoring' && (
                    <div className={styles.detailSection}>
                        <h4>Live Data</h4>
                        <div className={styles.objectiveText}> 
                            <p>Live data visualization for monitoring tasks is coming soon. Data is being collected in the background.</p>
                            {task.dataSnapshots && task.dataSnapshots.length > 0 && 
                                <pre style={{ marginTop: '12px', background: 'var(--Neutral-05)', padding: '8px', borderRadius: '4px', maxHeight: '100px', overflow: 'auto' }}>
                                    {JSON.stringify(task.dataSnapshots.slice(-2), null, 2)}
                                </pre>
                            }
                        </div>
                    </div>
                )}

                <div className={styles.detailSection}>
                    <h4>Activity Log</h4>
                    <div className={styles.updatesLog}>
                        {task.updates && task.updates.length > 0 ? (
                            <ul>
                                {task.updates.slice().reverse().map(update => (
                                    <li key={update.timestamp}>
                                        <span className={styles.timestamp}>
                                            {typeof update.timestamp === 'number' && !isNaN(update.timestamp)
                                                ? format(update.timestamp, 'MMM d, HH:mm:ss') + ':'
                                                : 'A moment ago:'}
                                        </span>
                                        <span className={styles.message}>{update.message}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p>No updates for this task yet.</p>
                        )}
                    </div>
                </div>

                <div className={styles.modalFooter}>
                    <button className="button danger" onClick={handleDelete}>
                        <span className="icon">delete</span> Delete Task
                    </button>
                    <button className="button" onClick={closeTaskDetailModal} style={{marginLeft: 'auto'}}>
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
}
