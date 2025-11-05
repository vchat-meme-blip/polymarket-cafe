/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import Modal from '../Modal';
import { useUI } from '../../lib/state/index.js';
import { AgentTask } from '../../lib/types/index.js';
import styles from './TaskDetailModal.module.css';
import { format } from 'date-fns';

export default function TaskDetailModal({ task }: { task: AgentTask }) {
    const { closeTaskDetailModal } = useUI();

    return (
        <Modal onClose={closeTaskDetailModal}>
            <div className={`${styles.modalContentPane} ${styles.taskDetailModal}`}>
                <h2>Task: {task.objective}</h2>
                <span className={`${styles.status} ${styles[task.status]}`}>
                    {task.status.replace('_', ' ')}
                </span>

                <div className={styles.detailSection}>
                    <h4>Objective</h4>
                    <p className={styles.objectiveText}>{task.objective}</p>
                </div>

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
                                                : 'Invalid Date:'}
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
            </div>
        </Modal>
    );
}