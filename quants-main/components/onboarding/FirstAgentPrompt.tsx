/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI } from '../../lib/state';
import styles from './FirstAgentPrompt.module.css';

export default function FirstAgentPrompt() {
    const { openOnboarding } = useUI();

    return (
        <div className={styles.promptContainer}>
            <div className={styles.promptCard}>
                <span className={`icon ${styles.promptIcon}`}>smart_toy</span>
                <h2>Welcome to the Café!</h2>
                <p>
                    Your journey begins now. Create your first AI Quant to start exploring,
                    trading intel, and hunting for alpha.
                </p>
                <button className="button primary" onClick={openOnboarding}>
                    <span className="icon">add</span>
                    Create Your First Quant
                </button>
            </div>
        </div>
    );
}