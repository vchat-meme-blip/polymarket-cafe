/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import Modal from '../Modal';
import { useUI, useArenaStore } from '../../lib/state/index.js';
import styles from './Modals.module.css';

export default function VisitStorefrontModal() {
    const { closeVisitStorefrontModal, setInitialArenaFocus, addToast } = useUI();
    const { rooms } = useArenaStore();
    const [roomId, setRoomId] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedId = roomId.trim();
        if (!trimmedId) return;

        if (rooms.some(r => r.id === trimmedId)) {
            setInitialArenaFocus(trimmedId);
            closeVisitStorefrontModal();
        } else {
            addToast({ type: 'error', message: `Storefront with ID "${trimmedId}" not found.` });
        }
    };

    return (
        <Modal onClose={closeVisitStorefrontModal}>
            <div className={`${styles.modalContentPane} ${styles.createRoomModal}`}>
                <h2>Visit Storefront</h2>
                <p>Enter the ID of the storefront you want to visit.</p>
                <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                    <input
                        type="text"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        placeholder="Enter Room ID..."
                        required
                    />
                    <button type="submit" className="button primary" style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}>
                        Go to Room
                    </button>
                </form>
            </div>
        </Modal>
    );
}