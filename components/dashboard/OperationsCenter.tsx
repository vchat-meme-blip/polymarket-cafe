/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import c from 'classnames';
import styles from './OperationsCenter.module.css';
import PortfolioPanel from './PortfolioPanel';
import IntelEconomyPanel from './IntelEconomyPanel';
import AgentActionsPanel from './AgentActionsPanel';
import ManageRoomPanel from './ManageRoomPanel';
import AgentTasksPanel from './AgentTasksPanel';
import ActivityLogPanel from './ActivityLogPanel';
import { useUI, useUser } from '../../lib/state/index.js';

type OperationsTab = 'performance' | 'control' | 'tasks' | 'activity';

export default function OperationsCenter() {
    const [activeTab, setActiveTab] = useState<OperationsTab>('performance');
    const { openAutonomyModal } = useUI();
    const { ownedRoomId } = useUser();

    const renderTabContent = () => {
        switch (activeTab) {
            case 'performance':
                return (
                    <div className={styles.performanceGrid}>
                        <PortfolioPanel />
                        <IntelEconomyPanel />
                    </div>
                );
            case 'control':
                return (
                    <div className={styles.controlGrid}>
                        {ownedRoomId ? <ManageRoomPanel /> : <AgentActionsPanel />}
                         <div className={`${styles.controlPanel}`}>
                            <h3 className={styles.panelTitle}>
                                <span className="icon">smart_toy</span>
                                Autonomy
                            </h3>
                            <button className="button" onClick={openAutonomyModal}>
                                <span className="icon">settings</span> Autonomy Settings
                            </button>
                        </div>
                    </div>
                );
            case 'tasks':
                return <AgentTasksPanel />;
            case 'activity':
                return <ActivityLogPanel />;
            default:
                return null;
        }
    };

    return (
        <div className={styles.operationsCenter}>
            <div className={styles.tabButtons}>
                <button
                    className={c(styles.tabButton, { [styles.active]: activeTab === 'performance' })}
                    onClick={() => setActiveTab('performance')}
                >
                    <span className="icon">monitoring</span> Performance
                </button>
                <button
                    className={c(styles.tabButton, { [styles.active]: activeTab === 'control' })}
                    onClick={() => setActiveTab('control')}
                >
                    <span className="icon">gamepad</span> Control
                </button>
                <button
                    className={c(styles.tabButton, { [styles.active]: activeTab === 'tasks' })}
                    onClick={() => setActiveTab('tasks')}
                >
                    <span className="icon">task_alt</span> Tasks
                </button>
                <button
                    className={c(styles.tabButton, { [styles.active]: activeTab === 'activity' })}
                    onClick={() => setActiveTab('activity')}
                >
                     <span className="icon">list_alt</span> Activity
                </button>
            </div>
            <div className={styles.tabContent}>
                {renderTabContent()}
            </div>
        </div>
    );
}
