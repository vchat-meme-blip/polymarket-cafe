/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useWalletStore } from '../../lib/state/wallet';
import styles from './Shell.module.css';

export default function WalletBalance() {
  const { balance } = useWalletStore();

  return (
    <div className={styles.walletBalance} title={`${balance.toFixed(2)} BOX`}>
      <span className="icon">redeem</span>
      <span>{balance.toLocaleString()}</span>
    </div>
  );
}