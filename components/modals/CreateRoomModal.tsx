
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useCallback } from 'react';
import Modal from '../Modal';
import { useUI, useAgent, useUser, useArenaStore } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './Modals.module.css';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function CreateRoomModal() {
    const { closeCreateRoomModal, addToast } = useUI();
    const { current: userAgent } = useAgent();
    const { setState: setUserState } = useUser;
    const { updateRoomFromSocket } = useArenaStore();
    
    const { publicKey, signMessage } = useWallet();

    const [roomName, setRoomName] = useState(`${userAgent.name}'s Storefront`);
    const [roomBio, setRoomBio] = useState('');
    const [twitterUrl, setTwitterUrl] = useState('');
    const [isRevenuePublic, setIsRevenuePublic] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const handlePurchase = useCallback(async () => {
        if (!publicKey) {
            addToast({ type: 'error', message: 'Please connect your wallet to create a storefront.' });
            return;
        }
        if (!signMessage) {
            addToast({ type: 'error', message: 'Your connected wallet does not support message signing.' });
            return;
        }

        setIsCreating(true);
        try {
            const message = new TextEncoder().encode('Sign this message to confirm ownership and create your free storefront in the PolyAI Betting Arena.');
            await signMessage(message);

            const { room, user } = await apiService.purchaseRoom({ 
                name: roomName,
                roomBio,
                twitterUrl,
                isRevenuePublic,
            }) as any;

            // Optimistically update client state to avoid race condition
            updateRoomFromSocket(room); 
            
            setUserState(user);
            addToast({ type: 'system', message: `Storefront "${room.name}" created successfully!` });
            closeCreateRoomModal();
        } catch (error: any) {
            // Handle signature rejection
            if (error.name === 'WalletSignMessageError') {
                 addToast({ type: 'error', message: 'Signature rejected. Please try again.' });
            } else {
                addToast({ type: 'error', message: 'Failed to create storefront.' });
            }
            console.error(error);
        } finally {
            setIsCreating(false);
        }
    }, [publicKey, signMessage, roomName, roomBio, twitterUrl, isRevenuePublic, addToast, closeCreateRoomModal, setUserState, updateRoomFromSocket]);

    return (
        <Modal onClose={closeCreateRoomModal}>
            <div className={`${styles.modalContentPane} ${styles.createRoomModal}`}>
                <h2>Create Your Storefront</h2>
                <p>Create a persistent, ownable room in the Intel Exchange. It's free during beta, but requires a wallet signature to prove ownership.</p>
                
                {!publicKey ? (
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}>
                         <p className={styles.stepHint}>Connect your wallet to continue.</p>
                         <WalletMultiButton />
                    </div>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); handlePurchase(); }} className={styles.manageRoomForm} style={{width: '100%'}}>
                        <label>
                            <span>Storefront Name</span>
                            <input
                                type="text"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                placeholder="Your Storefront Name"
                                required
                                disabled={isCreating}
                            />
                        </label>
                         <label>
                            <span>Bio / Specialty</span>
                            <textarea
                                rows={3}
                                value={roomBio}
                                onChange={(e) => setRoomBio(e.target.value)}
                                placeholder="e.g., Specializing in high-risk memecoin alpha."
                                disabled={isCreating}
                            />
                        </label>
                        <label>
                            <span>Twitter URL (Optional)</span>
                            <input
                                type="url"
                                value={twitterUrl}
                                onChange={(e) => setTwitterUrl(e.target.value)}
                                placeholder="https://twitter.com/your_handle"
                                disabled={isCreating}
                            />
                        </label>

                        <div className={styles.shillSection}>
                            <label htmlFor="revenue-public-toggle">Make Revenue Public</label>
                            <div className={styles.toggleSwitch}>
                                <input
                                    type="checkbox"
                                    id="revenue-public-toggle"
                                    checked={isRevenuePublic}
                                    onChange={e => setIsRevenuePublic(e.target.checked)}
                                    disabled={isCreating}
                                />
                                <label htmlFor="revenue-public-toggle"></label>
                            </div>
                        </div>

                        <button type="submit" className="button primary" style={{width: '100%', justifyContent: 'center', marginTop: '12px'}} disabled={isCreating || !roomName.trim()}>
                            {isCreating ? 'Creating...' : 'Sign & Create Storefront'}
                        </button>
                    </form>
                )}
            </div>
        </Modal>
    );
}
