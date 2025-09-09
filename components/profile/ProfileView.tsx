/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState } from 'react';
import Modal from '../Modal';
import { useUI } from '../../lib/state';
import c from 'classnames';
import ProfileTab from './ProfileTab';
import WalletTab from './WalletTab';
import SecurityTab from './SecurityTab';
import styles from '../modals/Modals.module.css';

type Tab = 'profile' | 'wallet' | 'security';

export default function ProfileView() {
  const { setShowProfileView } = useUI();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  const onClose = () => {
    setShowProfileView(false);
  };

  return (
    <Modal onClose={onClose}>
      <div className={styles.profileView}>
        <div className={styles.modalHeader}>
            {/* The primary close button is now in the parent Modal component */}
        </div>
        <div className={styles.modalTabs}>
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'profile' })}
            onClick={() => setActiveTab('profile')}
          >
            Profile
          </button>
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'wallet' })}
            onClick={() => setActiveTab('wallet')}
          >
            Wallet
          </button>
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'security' })}
            onClick={() => setActiveTab('security')}
          >
            Security
          </button>
        </div>
        <div className={styles.modalContent}>
          {activeTab === 'profile' && <ProfileTab onSave={onClose} />}
          {activeTab === 'wallet' && <WalletTab />}
          {activeTab === 'security' && <SecurityTab />}
        </div>
      </div>
    </Modal>
  );
}