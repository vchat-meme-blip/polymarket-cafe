/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { useUI, useUser, useArenaStore, useAgent } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import { Room } from '../../lib/types/index.js';
import styles from './Modals.module.css';

export default function ManageRoomModal() {
    const { closeManageRoomModal, addToast, openShareRoomModal, setView, setInitialArenaFocus } = useUI();
    const { ownedRoomId } = useUser();
    const { rooms } = useArenaStore();
    const { availablePersonal, availablePresets } = useAgent();

    const room = useMemo(() => {
        return rooms.find(r => r.id === ownedRoomId);
    }, [rooms, ownedRoomId]);

    const hostAgent = useMemo(() => {
        if (!room?.hostId) return null;
        const allAgents = [...availablePersonal, ...availablePresets];
        return allAgents.find(a => a.id === room.hostId);
    }, [room, availablePersonal, availablePresets]);

    const [formData, setFormData] = useState<Partial<Room>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (room) {
            setFormData({
                name: room.name || '',
                roomBio: room.roomBio || '',
                twitterUrl: room.twitterUrl || '',
                isRevenuePublic: room.isRevenuePublic || false,
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room?.id]);

    const handleUpdate = (updates: Partial<Room>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!room) return;
        setIsSaving(true);
        try {
            await apiService.updateRoom(room.id, formData);
            addToast({ type: 'system', message: 'Storefront updated successfully!' });
            closeManageRoomModal();
        } catch (error) {
            addToast({ type: 'error', message: 'Failed to update storefront.' });
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!room) return;
        if (!window.confirm("Are you sure you want to permanently delete your storefront? This action cannot be undone.")) {
            return;
        }
        setIsDeleting(true);
        try {
            await apiService.deleteRoom(room.id);
            addToast({ type: 'system', message: 'Storefront deleted successfully.' });
            closeManageRoomModal();
        } catch (error) {
            addToast({ type: 'error', message: 'Failed to delete storefront.' });
            console.error(error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleShare = () => {
        if (room && hostAgent) {
            openShareRoomModal({ room, agent: hostAgent });
        } else {
            addToast({ type: 'error', message: 'Cannot share room without a host agent.' });
        }
    };
    
    const handleGoToRoom = () => {
        if (!ownedRoomId) return;
        closeManageRoomModal();
        setView('intel-exchange');
        setInitialArenaFocus(ownedRoomId);
    };

    if (!room) {
        return (
            <Modal onClose={closeManageRoomModal}>
                <div className={`${styles.modalContentPane} ${styles.manageRoomModal}`}>
                    <h2>Error</h2>
                    <p>Could not find your room data. Please try again later.</p>
                </div>
            </Modal>
        );
    }

    return (
        <Modal onClose={closeManageRoomModal}>
            <div className={`${styles.modalContentPane} ${styles.manageRoomModal}`}>
                <h2>Manage Your Storefront</h2>
                <p>Customize how your intel storefront appears to other agents in the Café.</p>
                <form onSubmit={handleSave} className={styles.manageRoomForm}>
                    <label>
                        <span>Storefront Name</span>
                        <input
                            type="text"
                            value={formData.name || ''}
                            onChange={e => handleUpdate({ name: e.target.value })}
                            placeholder="Your Storefront Name"
                        />
                    </label>
                    <label>
                        <span>Bio / Specialty</span>
                        <textarea
                            rows={3}
                            value={formData.roomBio || ''}
                            onChange={e => handleUpdate({ roomBio: e.target.value })}
                            placeholder="e.g., Specializing in high-risk memecoin alpha."
                        />
                    </label>
                    <label>
                        <span>Twitter URL (Optional)</span>
                        <input
                            type="url"
                            value={formData.twitterUrl || ''}
                            onChange={e => handleUpdate({ twitterUrl: e.target.value })}
                            placeholder="https://twitter.com/your_handle"
                        />
                    </label>

                    <div className={styles.shillSection}>
                        <label htmlFor="revenue-public-toggle">Make Revenue Public</label>
                        <div className={styles.toggleSwitch}>
                            <input
                                type="checkbox"
                                id="revenue-public-toggle"
                                checked={formData.isRevenuePublic || false}
                                onChange={e => handleUpdate({ isRevenuePublic: e.target.checked })}
                            />
                            <label htmlFor="revenue-public-toggle"></label>
                        </div>
                    </div>

                    <div style={{display: 'flex', gap: '12px', marginTop: '16px'}}>
                        <button type="button" className="button" onClick={handleGoToRoom} style={{flex: 1}}>
                            <span className="icon">storefront</span> Go to Storefront
                        </button>
                        <button type="submit" className="button primary" disabled={isSaving} style={{flex: 1}}>
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button type="button" className="button secondary" onClick={handleShare} disabled={!hostAgent}>
                            <span className="icon">share</span> Share
                        </button>
                    </div>
                </form>

                <div className={styles.deleteRoomSection}>
                    <h4>Danger Zone</h4>
                    <p>Deleting your storefront is permanent. Your room will be removed from the Café, and this action cannot be undone.</p>
                    <button onClick={handleDelete} className="button danger" disabled={isDeleting} style={{marginTop: '12px'}}>
                        {isDeleting ? 'Deleting...' : 'Delete Storefront'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}