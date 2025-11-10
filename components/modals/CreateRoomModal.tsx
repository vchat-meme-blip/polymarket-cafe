
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState } from 'react';
import Modal from '../Modal';
import { useUI, useAgent, useWalletStore, useUser } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './Modals.module.css';

const ROOM_COST = 0.05; // Simulated ETH

export default function CreateRoomModal() {
    const { closeCreateRoomModal, addToast } = useUI();
    const { current: userAgent } = useAgent();
    const { addTransaction } = useWalletStore();
    const { setState: setUserState } = useUser;
    const [roomName, setRoomName] = useState(`${userAgent.name}'s Storefront`);
    const [isCreating, setIsCreating] = useState(false);

    const handlePurchase = async () => {
        setIsCreating(true);
        try {
            const { room, user } = await apiService.purchaseRoom({ name: roomName }) as any;
            setUserState(user); // Immediately update user state with new ownedRoomId
            addTransaction({
                type: 'room_purchase',
                amount: ROOM_COST,
                description: `Purchased Intel Storefront: ${room.name}`,
            });
            addToast({ type: 'system', message: `Storefront "${room.name}" purchased successfully!` });
            closeCreateRoomModal();
        } catch (error) {
            addToast({ type: 'error', message: 'Failed to purchase storefront.' });
            console.error(error);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Modal onClose={closeCreateRoomModal}>
            <div className={`${styles.modalContentPane} ${styles.createRoomModal}`}>
                <h2>Purchase a Storefront</h2>
                <p>Create a persistent, ownable room in the Intel Exchange that acts as your personal intel shop. Cost: {ROOM_COST} ETH (Simulated).</p>
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
                    <button type="submit" className="button primary" style={{width: '100%', justifyContent: 'center', marginTop: '12px'}} disabled={isCreating || !roomName.trim()}>
                        {isCreating ? 'Purchasing...' : `Purchase for ${ROOM_COST} ETH`}
                    </button>
                </form>
            </div>
        </Modal>
    );
}
