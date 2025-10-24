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

const AGENT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', 
  '#9b59b6', '#e67e22', '#1abc9c', '#e84393'
];

const WanderingAgentsPanel = () => {
  const { agentLocations } = useArenaStore();
  const { availablePresets, availablePersonal } = useAgent();
  const allAgents = useMemo(
    () => [...availablePresets, ...availablePersonal],
    [availablePresets, availablePersonal],
  );

  const wanderingAgents = allAgents.filter(
    agent => agentLocations[agent.id] === null,
  );

  if (wanderingAgents.length === 0) {
    return null;
  }

  return (
    <div className={styles.wanderingAgentsPanel}>
      <h4>Wandering Agents</h4>
      <div className={styles.wanderingAgentsList}>
        {wanderingAgents.map(agent => {
          const color = AGENT_COLORS[agent.name.charCodeAt(0) % AGENT_COLORS.length];
          return (
            <div
              key={agent.id}
              className={styles.wanderingAgentChip}
              title={agent.name}
            >
              <div
                className={styles.agentIcon}
                style={{ backgroundColor: color }}
              >
                {agent.name.charAt(0).toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RoomCardActions = ({ onListenIn, onShowDetails, isConversationActive }: { onListenIn: () => void; onShowDetails: () => void; isConversationActive: boolean; }) => {
    return (
        <div className={styles.roomCardActionsOverlay}>
            <button className="button secondary" onClick={onShowDetails}>
                <span className="icon">info</span> Details
            </button>
            <button className="button primary" onClick={onListenIn}>
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
    const { rooms, agentLocations, activeConversations } = useArenaStore();
  const { current: userAgent } = useAgent();
  const { openListenInModal, openHelpModal, setShowRoomDetailModal, openServerHealthModal, initialArenaFocus, setInitialArenaFocus } = useUI();
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
  const roomStripRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (initialArenaFocus) {
        setFocusedRoomId(initialArenaFocus);
        const roomElement = roomStripRef.current?.querySelector(`[data-room-id="${initialArenaFocus}"]`);
        roomElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        setInitialArenaFocus(null); // Reset after focusing
    } else if (focusedRoomId && rooms.some(r => r.id === focusedRoomId)) {
        return; // Already focused on a valid room
    } else {
        const firstActiveRoom = rooms.find(r => r.agentIds.length > 0);
        if (firstActiveRoom) {
            setFocusedRoomId(firstActiveRoom.id);
        } else if (rooms.length > 0) {
            setFocusedRoomId(rooms[0].id);
        }
    }
    }, [rooms, focusedRoomId, initialArenaFocus, setInitialArenaFocus]);

  const isFocusedRoomActive = useMemo(() => {
    if (!focusedRoomId) return false;
    const lastActivity = activeConversations[focusedRoomId];
    if (!lastActivity) return false;
    // Consider active if the last message was within 10 seconds
    return Date.now() - lastActivity < 10000;
  }, [activeConversations, focusedRoomId]);

  const focusedRoom = useMemo(() => {
    return rooms.find(r => r.id === focusedRoomId);
  }, [rooms, focusedRoomId]);

  const handleGoToMyAgent = () => {
    const myRoomId = agentLocations[userAgent.id];
    if (myRoomId) {
      setFocusedRoomId(myRoomId);
      const roomElement = roomStripRef.current?.querySelector(`[data-room-id="${myRoomId}"]`);
      roomElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  const handleFindRoom = () => {
    const activeRooms = rooms.filter(r => r.agentIds.length > 0 && r.id !== focusedRoomId);
    if (activeRooms.length > 0) {
      const randomRoom = activeRooms[Math.floor(Math.random() * activeRooms.length)];
      setFocusedRoomId(randomRoom.id);
    } else {
      alert("No other active rooms found. The simulation is just getting started!");
    }
  };
  
  const isUserAgentInCafe = agentLocations[userAgent.id] !== undefined;

  const CafeActionButtons = () => (
    <>
      <button className="button" onClick={handleGoToMyAgent} disabled={!isUserAgentInCafe} title="Focus on the room your active agent is in">
          <span className="icon">my_location</span> Go to My Agent
      </button>
       <button className="button" onClick={handleFindRoom} title="Jump to a random active room">
          <span className="icon">casino</span> Find Intel
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
              <span className="icon">coffee</span>
              <p>No rooms available. The Intel Exchange is warming up!</p>
          </div>
        )}
      </div>

      {focusedRoom && (
          <RoomCardActions
            onListenIn={() => openListenInModal(focusedRoom.id)}
            onShowDetails={() => setShowRoomDetailModal(focusedRoom.id)}
            isConversationActive={isFocusedRoomActive}
          />
      )}

      <div className={`${styles.arenaUiOverlay} ${styles.bottom}`}>
         <WanderingAgentsPanel />
         <RoomStrip
            ref={roomStripRef}
            rooms={rooms}
            focusedRoomId={focusedRoomId}
            onRoomSelect={setFocusedRoomId}
         />
      </div>
    </div>
  );
}
