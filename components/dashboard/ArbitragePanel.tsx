

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import styles from './Dashboard.module.css';

export default function ArbitragePanel() {
    return (
        <div className={styles.arbitragePanel}>
            <span className="icon">compare_arrows</span>
            <h4>Arbitrage Scanner</h4>
            <p>Coming soon: This panel will automatically scan for price discrepancies between Polymarket and Kalshi, highlighting potential arbitrage opportunities.</p>
        </div>
    );
}