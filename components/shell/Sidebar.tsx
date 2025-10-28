/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Fix imports for `useUI` and `useUser` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useUI, useUser } from '../../lib/state/index.js';
import c from 'classnames';
import { useState } from 'react';
import styles from './Shell.module.css';

const ConnectWalletButton = () => {
  const { solanaWalletAddress, connectWallet } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    // In a real app, this would trigger a wallet adapter modal.
    // The state action now simulates a signature request.
    await connectWallet('4p4h2h1q8z2z8z8y8f8e8d8c8b8a898887868584'); 
    setIsConnecting(false);
  };

  if (solanaWalletAddress) {
    return (
      <div className={styles.walletConnectedDisplay} title={solanaWalletAddress}>
        <span className="icon">account_balance_wallet</span>
        <span>
          {solanaWalletAddress.slice(0, 4)}...{solanaWalletAddress.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.walletButtonContainer}>
      <button 
        className={`button primary ${styles.connectWalletBtn}`} 
        onClick={handleConnect} 
        disabled={isConnecting}
        aria-label={isConnecting ? 'Connecting...' : 'Connect Wallet'}
        title={isConnecting ? 'Connecting...' : 'Connect Wallet'}
      >
        <span className="icon">account_balance_wallet</span>
        <span className={styles.walletButtonText}>
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </span>
      </button>
    </div>
  );
};


/**
 * A persistent sidebar for navigating between the main views of the application.
 */
export default function Sidebar() {
  const { view, setView, setIsSignedIn, setShowProfileView, isMobileNavOpen } = useUI();
  const { _setHandle } = useUser();

  function handleSignOut() {
    _setHandle(''); // Clear the persisted handle directly
    setIsSignedIn(false);
  }

  return (
    <nav className={c(styles.sidebar, { [styles.sidebarHidden]: !isMobileNavOpen })}>
      <div className={styles.sidebarTop}>
        <button
          className={c(styles.sidebarButton, { [styles.active]: view === 'dashboard' })}
          onClick={() => setView('dashboard')}
          aria-label="Dashboard"
          data-tooltip="Dashboard"
        >
          <span className="icon">chat</span>
        </button>
        <button
          className={c(styles.sidebarButton, { [styles.active]: view === 'agents' })}
          onClick={() => setView('agents')}
          aria-label="My Agents"
          data-tooltip="My Agents"
        >
          <span className="icon">groups</span>
        </button>
        <button
          className={c(styles.sidebarButton, { [styles.active]: view === 'prediction-hub' })}
          onClick={() => setView('prediction-hub')}
          aria-label="Prediction Hub"
          data-tooltip="Prediction Hub"
        >
          <span className="icon">insights</span>
        </button>
        <button
          className={c(styles.sidebarButton, { [styles.active]: view === 'leaderboard' })}
          onClick={() => setView('leaderboard')}
          aria-label="Leaderboard"
          data-tooltip="Leaderboard"
        >
          <span className="icon">leaderboard</span>
        </button>
        <button
          className={c(styles.sidebarButton, { [styles.active]: view === 'intel-exchange' })}
          onClick={() => setView('intel-exchange')}
          aria-label="Intel Exchange"
          data-tooltip="Intel Exchange"
        >
          <span className="icon">coffee</span>
        </button>
        <button
          className={c(styles.sidebarButton, { [styles.active]: view === 'bounty' })}
          onClick={() => setView('bounty')}
          aria-label="Bounty Board"
          data-tooltip="Bounty Board"
        >
          <span className="icon">task</span>
        </button>
        <button
          className={c(styles.sidebarButton, { [styles.active]: view === 'mail' })}
          onClick={() => setView('mail')}
          aria-label="Letter Box"
          data-tooltip="Letter Box"
        >
          <span className="icon">inventory</span>
        </button>
      </div>
      <div className={styles.sidebarBottom}>
        <ConnectWalletButton />
        <button
          className={styles.sidebarButton}
          onClick={() => setShowProfileView(true)}
          aria-label="Profile & Settings"
          data-tooltip="Profile & Settings"
        >
          <span className="icon">account_circle</span>
        </button>
        <button
          className={styles.sidebarButton}
          onClick={handleSignOut}
          aria-label="Sign Out"
          data-tooltip="Sign Out"
        >
          <span className="icon">logout</span>
        </button>
      </div>
    </nav>
  );
}