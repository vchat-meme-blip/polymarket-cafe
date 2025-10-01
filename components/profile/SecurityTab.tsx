/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI, useUser } from '../../lib/state';
import { useState } from 'react';
import styles from './Profile.module.css';

export default function SecurityTab() {
  const { setIsSignedIn } = useUI();
  const {
    solanaWalletAddress,
    userApiKey,
    connectWallet,
    disconnectWallet,
    setUserApiKey,
    _setHandle,
  } = useUser();
  const [apiKeyInput, setApiKeyInput] = useState(userApiKey || '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function handleSignOut() {
    // Clear local state first for immediate UI update
    _setHandle('');
    setIsSignedIn(false);
    // No need to call server, bootstrap will handle next sign-in
  }

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    // A real app would use a wallet adapter like @solana/wallet-adapter-react
    await connectWallet('4p4h2h1q8z2z8z8y8f8e8d8c8b8a898887868584'); 
    setIsConnecting(false);
  };

  const handleDisconnectWallet = async () => {
    setIsConnecting(true);
    await disconnectWallet();
    setIsConnecting(false);
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setIsSaving(true);
    await setUserApiKey(apiKeyInput.trim());
    setIsSaving(false);
    alert('API Key settings saved!');
  };

  return (
    <div className={styles.securityTabContent}>
      <div className={styles.securitySection}>
        <h4>Wallet Connection</h4>
        {solanaWalletAddress ? (
          <div>
            <p className={styles.walletAddressDisplay}>{solanaWalletAddress}</p>
            <button className="button" onClick={handleDisconnectWallet} disabled={isConnecting}>
              <span className="icon">link_off</span>
              {isConnecting ? 'Disconnecting...' : 'Disconnect Wallet'}
            </button>
          </div>
        ) : (
          <div>
            <p className={styles.stepHint} style={{ marginBottom: '12px' }}>
              Connect your Solana wallet to serve as your unique user ID and for
              future on-chain interactions.
            </p>
            <div className={styles.walletButtonContainer}>
              <button 
                className={`button primary ${styles.connectWalletBtn}`} 
                onClick={handleConnectWallet} 
                disabled={isConnecting}
                aria-label={isConnecting ? 'Connecting...' : 'Connect Wallet'}
              >
                <span className="icon">account_balance_wallet</span>
                <span className={styles.walletButtonText}>
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.securitySection}>
        <h4>Gemini API Key</h4>
        <p className={styles.stepHint} style={{ marginBottom: '12px' }}>
          Save your own Gemini API key to be used for your personal agent chats.
          Your key will be stored securely on our server.
        </p>
        <form onSubmit={handleSaveApiKey} className={styles.apiKeyForm}>
          <input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="Enter your Gemini API Key"
            disabled={isSaving}
          />
          <button type="submit" className="button primary" disabled={isSaving || !apiKeyInput.trim()}>
            {isSaving ? 'Saving...' : 'Save Key'}
          </button>
        </form>
      </div>

      <div className={styles.profileFooter}>
        <button onClick={handleSignOut} className="button danger">
          Sign Out
        </button>
      </div>
    </div>
  );
}