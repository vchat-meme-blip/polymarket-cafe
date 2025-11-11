/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI, useUser } from '../../lib/state/index.js';
import React from 'react';
import { useState } from 'react';
import styles from './Profile.module.css';

export default function SecurityTab() {
  const { setIsSignedIn } = useUI();
  const {
    solanaWalletAddress,
    userApiKey,
    receivingWalletAddress,
    connectWallet,
    disconnectWallet,
    setUserApiKey,
    updateUserSettings,
    _setHandle,
  } = useUser();
  const [apiKeyInput, setApiKeyInput] = useState(userApiKey || '');
  const [walletInput, setWalletInput] = useState(receivingWalletAddress || '');
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
    await connectWallet('4p4h2h1q8z2z8z8y8f8e8d8c8b8a898887868584'); 
    setIsConnecting(false);
  };

  const handleDisconnectWallet = async () => {
    setIsConnecting(true);
    await disconnectWallet();
    setIsConnecting(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
        await Promise.all([
            setUserApiKey(apiKeyInput.trim()),
            updateUserSettings({ receivingWalletAddress: walletInput.trim() })
        ]);
        alert('Settings saved!');
    } catch (error) {
        alert('Failed to save settings.');
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className={styles.securityTabContent}>
      <form onSubmit={handleSaveSettings}>
        <div className={styles.securitySection}>
            <h4>Wallet Connection</h4>
            {solanaWalletAddress ? (
            <div>
                <p className={styles.walletAddressDisplay}>{solanaWalletAddress}</p>
                <button type="button" className="button" onClick={handleDisconnectWallet} disabled={isConnecting}>
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
                    type="button"
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
            <h4>Receiving Wallet</h4>
            <p className={styles.stepHint} style={{ marginBottom: '12px' }}>
            Set the public address where you'll receive payments from your storefront sales (e.g., your Base USDC address).
            </p>
            <input
                type="text"
                value={walletInput}
                onChange={e => setWalletInput(e.target.value)}
                placeholder="Enter your receiving wallet address"
                disabled={isSaving}
            />
        </div>

        <div className={styles.securitySection}>
            <h4>OpenAI API Key</h4>
            <p className={styles.stepHint} style={{ marginBottom: '12px' }}>
            Save your own OpenAI API key to be used for your personal agent chats.
            Your key will be stored securely on our server.
            </p>
            <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="Enter your Gemini API Key"
                disabled={isSaving}
            />
        </div>
        
        <div className={styles.profileFooter} style={{justifyContent: 'space-between'}}>
            <button type="button" onClick={handleSignOut} className="button danger">
                Sign Out
            </button>
            <button type="submit" className="button primary" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save All Settings'}
            </button>
        </div>
      </form>
    </div>
  );
}
