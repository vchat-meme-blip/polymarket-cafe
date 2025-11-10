
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useArenaStore } from '../../lib/state/arena';
import { useAgent, useUI } from '../../lib/state/index.js';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import RoomCard from './RoomCard';
import ArenaStatsDisplay from './ArenaStatsDisplay';
import RoomStrip from './RoomStrip';
import CafeMusicController from './CafeMusicController';
import styles from './Arena.module.css';
import './Pulse.css';
import { apiService } from '../../lib/services/api.service.js';

const RoomCardActions = ({ onListenIn, onShowDetails, isConversationActive, disabled }: { onListenIn: () => void; onShowDetails: () => void; isConversationActive: boolean; disabled: boolean; }) => {
    return (
        <div className={styles.roomCardActionsOverlay}>
            <button className="button secondary" onClick={onShowDetails} disabled={disabled}>
                <span className="icon">info</span> Details
            </button>
            <button className="button primary" onClick={onListenIn} disabled={disabled}>
                <span className={`icon ${isConversationActive ? 'pulse' : ''}`}>hearing</span> Listen In
            </button>
        </div>
    );
};

/**
 * The main Intel Exchange view, featuring a large "Focus View" for one room
 * and a scrollable "Room Strip" at the bottom for navigation.
 */
export default function IntelExchangeView() {
    const { rooms, activeConversations } = useArenaStore();
    const { current: userAgent } = useAgent();
    const { openListenInModal, openHelpModal, setShowRoomDetailModal, openServerHealthModal, initialArenaFocus, setInitialArenaFocus, openVisitStorefrontModal } = useUI();
    const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
    const roomStripRef = useRef<HTMLDivElement>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const storefronts = useMemo(() => rooms.filter(r => r.isOwned), [rooms]);

    useEffect(() => {
        if (initialArenaFocus) {
            setFocusedRoomId(initialArenaFocus);
            const roomElement = roomStripRef.current?.querySelector(`[data-room-id="${initialArenaFocus}"]`);
            roomElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            setInitialArenaFocus(null); // Reset after focusing
        } else if (focusedRoomId && storefronts.some(r => r.id === focusedRoomId)) {
            return; // Already focused on a valid room
        } else {
            const firstActiveStorefront = storefronts.find(r => r.agentIds.length > 0);
            if (firstActiveStorefront) {
                setFocusedRoomId(firstActiveStorefront.id);
            } else if (storefronts.length > 0) {
                setFocusedRoomId(storefronts[0].id);
            }
        }
    }, [storefronts, focusedRoomId, initialArenaFocus, setInitialArenaFocus]);


    const isFocusedRoomActive = useMemo(() => {
        if (!focusedRoomId) return false;
        const lastActivity = activeConversations[focusedRoomId];
        if (!lastActivity) return false;
        // Consider active if the last message was within 10 seconds
        return Date.now() - lastActivity < 10000;
    }, [activeConversations, focusedRoomId]);

    const focusedRoom = useMemo(() => {
        return storefronts.find(r => r.id === focusedRoomId);
    }, [storefronts, focusedRoomId]);

    const handleVisitRandom = () => {
        const activeStorefronts = storefronts.filter(r => r.agentIds.length > 0 && r.id !== focusedRoomId);
        if (activeStorefronts.length > 0) {
            const randomRoom = activeStorefronts[Math.floor(Math.random() * activeStorefronts.length)];
            setFocusedRoomId(randomRoom.id);
        } else {
            alert("No other active storefronts found. The simulation is just getting started!");
        }
    };
  
    const CafeActionButtons = () => (
    <>
       <button className="button" onClick={handleVisitRandom} title="Jump to a random active storefront">
          <span className="icon">casino</span> Visit Random
      </button>
      <button className="button" onClick={openVisitStorefrontModal} title="Go to a specific storefront by its ID">
          <span className="icon">store</span> Visit by ID
      </button>
       <button className="button" onClick={openServerHealthModal} title="View live server statistics and activity feed">
          <span className="icon">monitoring</span> Server Health
      </button>
       <button className="button" onClick={openHelpModal} title="Get help and learn about the features">
          <span className="icon">help</span> Help
      </button>
    </>
  );

    return (
        <div className={styles.arenaFocusView}>
            <div className={`${styles.arenaUiOverlay} ${styles.top}`}>
                <ArenaStatsDisplay />
                <CafeMusicController roomId={focusedRoomId} />
                <div className={styles.cafeActions}>
                    <CafeActionButtons />
                </div>
                <div className={styles.mobileMenuContainer}>
                    <button className={`button ${styles.menuButton}`} onClick={() => setIsMenuOpen(!isMenuOpen)}>
                        <span className="icon">menu</span> Menu
                    </button>
                    {isMenuOpen && (
                        <div className={styles.dropdownMenu}>
                            <CafeActionButtons />
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.arenaMainContent}>
                {focusedRoom ? (
                    <RoomCard
                        key={focusedRoom.id}
                        room={focusedRoom}
                        userAgent={userAgent}
                    />
                ) : (
                   <div className={styles.roomCardPlaceholder}>
                      <span className="icon">storefront</span>
                      <p>No storefronts available. Be the first to create one!</p>
                  </div>
                )}
            </div>

            <RoomCardActions
                onListenIn={() => focusedRoom?.id && openListenInModal(focusedRoom.id)}
                onShowDetails={() => setShowRoomDetailModal(focusedRoom?.id || null)}
                isConversationActive={isFocusedRoomActive}
                disabled={!focusedRoom}
            />

            <div className={`${styles.arenaUiOverlay} ${styles.bottom}`}>
                 <RoomStrip
                    ref={roomStripRef}
                    rooms={storefronts}
                    focusedRoomId={focusedRoomId}
                    onRoomSelect={setFocusedRoomId}
                 />
            </div>
        </div>
    );
}
