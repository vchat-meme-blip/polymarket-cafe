/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI, useUser } from '../../lib/state/index.js';
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import styles from './Profile.module.css';

export default function SecurityTab() {
  const { setIsSignedIn } = useUI();
  const {
    receivingWalletAddress,
    updateUserSettings,
    _setHandle,
  } = useUser();
  
  const { publicKey } = useWallet();
  
  const [walletInput, setWalletInput] = useState(receivingWalletAddress || '');
  const [isSaving, setIsSaving] = useState(false);

  // Sync the connected wallet address to user settings whenever it changes.
  useEffect(() => {
    const syncWalletAddress = async () => {
      if (publicKey) {
        try {
          await updateUserSettings({ 
            solanaWalletAddress: publicKey.toString() 
          });
        } catch (err) {
          console.error('Failed to update wallet address:', err);
        }
      }
    };
    
    syncWalletAddress();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  function handleSignOut() {
    _setHandle('');
    setIsSignedIn(false);
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
        await updateUserSettings({ receivingWalletAddress: walletInput.trim() });
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
          <p className={styles.stepHint} style={{ marginBottom: '12px' }}>
            Connect your Solana wallet to serve as your unique user ID and for
            on-chain payments.
          </p>
          <div className={styles.walletButtonContainer}>
            <WalletMultiButton />
          </div>
           {publicKey && (
                <p className={styles.walletAddressDisplay} style={{marginTop: '12px', textAlign: 'center'}}>
                    Connected: {publicKey.toBase58()}
                </p>
            )}
        </div>

        <div className={styles.securitySection}>
            <h4>Receiving Wallet</h4>
            <p className={styles.stepHint} style={{ marginBottom: '12px' }}>
            Set the public address where you'll receive payments from your storefront sales (e.g., your Solana USDC address).
            </p>
            <input
                type="text"
                value={walletInput}
                onChange={e => setWalletInput(e.target.value)}
                placeholder="Enter your receiving wallet address"
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