/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useWalletStore } from '../../lib/state/wallet';
// FIX: The 'Transaction' type is not exported from the wallet store. It is now imported from its correct source file 'lib/types/index.js'.
import { Transaction } from '../../lib/types/index.js';
import { formatDistanceToNow } from 'date-fns';
import c from 'classnames';
import styles from './Profile.module.css';

const TransactionItem = ({ tx }: { tx: Transaction }) => {
  const isSent = tx.type === 'send';
  return (
    <div className={styles.txItem}>
      <div className={styles.txDetails}>
        <p className={styles.txDescription}>{tx.description}</p>
        <p className={styles.txTime}>
          {formatDistanceToNow(tx.timestamp, { addSuffix: true })}
        </p>
      </div>
      <div
        className={c(styles.txAmount, {
          [styles.sent]: isSent,
          [styles.received]: !isSent,
        })}
      >
        {isSent ? '-' : '+'}
        {tx.amount.toLocaleString()}
      </div>
    </div>
  );
};

export default function TransactionHistory() {
  const { transactions } = useWalletStore();

  if (transactions.length === 0) {
    return <p className="empty-chat-log">No transactions yet.</p>;
  }

  return (
    <div className={styles.transactionList}>
      {transactions.map(tx => (
        <TransactionItem key={tx.id} tx={tx} />
      ))}
    </div>
  );
}