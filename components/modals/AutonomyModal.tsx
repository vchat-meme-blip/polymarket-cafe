/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import Modal from '../Modal';
import { useUI, useAutonomyStore } from '../../lib/state/index.js';
import styles from './Modals.module.css';

const decisionTree = [
    { percentage: 70, title: 'Go to the Café', description: "The agent's most common action is to enter the Intel Exchange to find conversations and trade intel, fueling the social economy.", icon: 'coffee' },
    { percentage: 20, title: 'Proactive User Engagement', description: "The agent reviews its recent findings or your portfolio and formulates a relevant question or suggestion to send to your dashboard.", icon: 'chat' },
    { percentage: 10, title: 'Conduct Deep Research', description: "As a rarer action, the agent performs a deep, multi-step analysis of a trending market using its web research tools to find new alpha.", icon: 'travel_explore' }
];

export default function AutonomyModal() {
    const { closeAutonomyModal } = useUI();
    const { isAutonomyEnabled, toggleAutonomy } = useAutonomyStore();

    return (
        <Modal onClose={closeAutonomyModal}>
            <div className={`${styles.modalContentPane} ${styles.autonomyModal}`}>
                <h2>Agent Autonomy</h2>
                <p>Your active agent operates 24/7, even when you're offline. On each "tick," it makes a probabilistic decision on what to do next.</p>
                <div className={styles.decisionTree}>
                    {decisionTree.map(node => (
                        <div key={node.title} className={styles.treeNode}>
                            <h4><span className={styles.percentage}>{node.percentage}%</span> {node.title}</h4>
                            <p>{node.description}</p>
                        </div>
                    ))}
                </div>
                <div className={styles.autonomyControls}>
                    <div className={styles.toggleControl}>
                        <label htmlFor="autonomy-toggle">Enable Autonomy</label>
                        <div className={styles.toggleSwitch}>
                            <input
                                type="checkbox"
                                id="autonomy-toggle"
                                checked={isAutonomyEnabled}
                                onChange={toggleAutonomy}
                            />
                            <label htmlFor="autonomy-toggle"></label>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}