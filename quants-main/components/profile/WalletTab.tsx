/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useWalletStore } from '../../lib/state/wallet';
import TransactionHistory from './TransactionHistory';
import styles from './Profile.module.css';

export default function WalletTab() {
  const { balance, claimInitialTokens, transactions } = useWalletStore();
  const hasClaimed = transactions.some(tx => tx.type === 'claim');

  return (
    <div className={styles.walletTabContent}>
      <div className={styles.balanceDisplay}>
        <p className={styles.balanceLabel}>Your BOX Balance</p>
        <h2 className={styles.balanceAmount}>
          <span className="icon">redeem</span>
          {balance.toLocaleString()}
        </h2>
      </div>
      {!hasClaimed && (
        <button className={`button ${styles.claimButton}`} onClick={claimInitialTokens}>
          Claim 1,000 BOX
        </button>
      )}
      <div>
        <h3 className={styles.txHistoryTitle}>Transaction History</h3>
        <TransactionHistory />
      </div>
    </div>
  );
}