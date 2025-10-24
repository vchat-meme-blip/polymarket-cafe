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

    const handleCreatePublic = async () => {
        setIsCreating(true);
        try {
            await apiService.createAndHostRoom(userAgent.id);
            addToast({ type: 'system', message: 'Public room created successfully!' });
            closeCreateRoomModal();
        } catch (error) {
            addToast({ type: 'error', message: 'Failed to create public room.' });
            console.error(error);
        } finally {
            setIsCreating(false);
        }
    };

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
                <h2>Create a Room</h2>
                <p>Choose the type of room you want to create in the Intel Exchange.</p>
                <div className={styles.roomOptions}>
                    <button onClick={handleCreatePublic} className={styles.roomOptionCard} disabled={isCreating}>
                        <h4><span className="icon">groups</span>Create Public Room</h4>
                        <p>A free, temporary room for quick chats. It will be deleted when empty.</p>
                    </button>
                    <div className={`${styles.roomOptionCard} ${isCreating ? styles.disabled : ''}`}>
                        <h4><span className="icon">storefront</span>Purchase Intel Storefront</h4>
                        <p>A persistent, ownable room that acts as your intel shop. Cost: {ROOM_COST} ETH (Simulated).</p>
                        <form onSubmit={(e) => { e.preventDefault(); handlePurchase(); }} style={{marginTop: '16px'}}>
                            <input
                                type="text"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                placeholder="Your Storefront Name"
                                required
                                disabled={isCreating}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <button type="submit" className="button primary" style={{width: '100%', justifyContent: 'center', marginTop: '12px'}} disabled={isCreating || !roomName.trim()}>
                                {isCreating ? 'Purchasing...' : 'Purchase'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </Modal>
    );
}