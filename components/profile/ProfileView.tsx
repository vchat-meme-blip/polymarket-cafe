/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect } from 'react';
import Modal from '../Modal';
// FIX: Aliased ProfileTab type to avoid name collision with the ProfileTab component.
import { useUI, type ProfileTab as ProfileTabType } from '../../lib/state/index.js';
import c from 'classnames';
import ProfileTab from './ProfileTab';
import WalletTab from './WalletTab';
import SecurityTab from './SecurityTab';
import NotificationsTab from './NotificationsTab';
import BillingTab from './BillingTab';
import styles from '../modals/Modals.module.css';

export default function ProfileView() {
  const { setShowProfileView, profileInitialTab } = useUI();
  // FIX: Use the aliased type ProfileTabType to resolve duplicate identifier error.
  const [activeTab, setActiveTab] = useState<ProfileTabType>(profileInitialTab || 'profile');

  useEffect(() => {
    if (profileInitialTab) {
      setActiveTab(profileInitialTab);
    }
  }, [profileInitialTab]);

  const onClose = () => {
    setShowProfileView(false, null);
  };

  return (
    <Modal onClose={onClose}>
      <div className={styles.profileView}>
        <div className={styles.modalHeader}>
            <h2>Settings</h2>
        </div>
        <div className={styles.modalTabs}>
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'profile' })}
            onClick={() => setActiveTab('profile')}
          >
            Profile
          </button>
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'billing' })}
            onClick={() => setActiveTab('billing')}
          >
            Billing
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
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'wallet' && <WalletTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'notifications' && <NotificationsTab onSave={onClose} />}
        </div>
      </div>
    </Modal>
  );
}