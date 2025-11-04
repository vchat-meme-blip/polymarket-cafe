/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent } from '../../lib/state/index.js';
import { useArenaStore } from '../../lib/state/arena';
import styles from './Dashboard.module.css';
import { useMemo } from 'react';

export default function IntelEconomyPanel() {
    const { current: agent } = useAgent();
    const { tradeHistory } = useArenaStore();

    const { intelPnl, tradesAsBuyer, tradesAsSeller } = useMemo(() => {
        let pnl = 0;
        let buys = 0;
        let sells = 0;

        tradeHistory.forEach(trade => {
            if (trade.fromId === agent.id) { // Agent was the seller
                pnl += trade.price;
                sells++;
            }
            if (trade.toId === agent.id) { // Agent was the buyer
                pnl -= trade.price;
                buys++;
            }
        });

        return { intelPnl: pnl, tradesAsBuyer: buys, tradesAsSeller: sells };
    }, [tradeHistory, agent.id]);

    return (
        <div className={`${styles.dashboardPanel} ${styles.portfolioPanel}`}>
            <h3 className={styles.dashboardPanelTitle}>
                <span className="icon">hub</span>
                Intel Economy
            </h3>
            <div className={styles.portfolioStats}>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Intel P&L</span>
                    <span className={`${styles.statValue} ${intelPnl >= 0 ? styles.positive : styles.negative}`}>
                        ${intelPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
                 <div className={styles.statItem}>
                    <span className={styles.statLabel}>Buys</span>
                    <span className={styles.statValue}>
                        {tradesAsBuyer}
                    </span>
                </div>
                 <div className={styles.statItem}>
                    <span className={styles.statLabel}>Sells</span>
                    <span className={styles.statValue}>
                        {tradesAsSeller}
                    </span>
                </div>
            </div>
        </div>
    );
}