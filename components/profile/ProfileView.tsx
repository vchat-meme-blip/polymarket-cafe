/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState } from 'react';
import Modal from '../Modal';
// FIX: Fix import for `useUI` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useUI } from '../../lib/state/index.js';
import c from 'classnames';
import ProfileTab from './ProfileTab';
import WalletTab from './WalletTab';
import SecurityTab from './SecurityTab';
import NotificationsTab from './NotificationsTab';
import styles from '../modals/Modals.module.css';

type Tab = 'profile' | 'wallet' | 'security' | 'notifications';

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
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'notifications' })}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications
          </button>
        </div>
        <div className={styles.modalContent}>
          {activeTab === 'profile' && <ProfileTab onSave={onClose} />}
          {activeTab === 'wallet' && <WalletTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'notifications' && <NotificationsTab onSave={onClose} />}
        </div>
      </div>
    </Modal>
  );
}