/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent } from '../../lib/state/index.js';
import styles from './Dashboard.module.css';

export default function PortfolioPanel() {
    const { current: agent } = useAgent();
    // The portfolio is deprecated, but let's show PnL and other stats.
    const { currentPnl, bettingHistory } = agent;

    const totalBets = bettingHistory?.length || 0;
    const winningBets = bettingHistory?.filter(b => b.pnl && b.pnl > 0).length || 0;
    const winRate = totalBets > 0 ? (winningBets / totalBets) * 100 : 0;

    return (
        <div className={`${styles.dashboardPanel} ${styles.portfolioPanel}`}>
            <h3 className={styles.dashboardPanelTitle}>
                <span className="icon">monitoring</span>
                Performance
            </h3>
            <div className={styles.portfolioStats}>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Total P&L</span>
                    <span className={`${styles.statValue} ${currentPnl >= 0 ? styles.positive : styles.negative}`}>
                        ${currentPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
                 <div className={styles.statItem}>
                    <span className={styles.statLabel}>Win Rate</span>
                    <span className={styles.statValue}>
                        {winRate.toFixed(1)}%
                    </span>
                </div>
                 <div className={styles.statItem}>
                    <span className={styles.statLabel}>Total Bets</span>
                    <span className={styles.statValue}>
                        {totalBets}
                    </span>
                </div>
            </div>
        </div>
    );
}
