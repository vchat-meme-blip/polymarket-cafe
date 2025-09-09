/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState } from 'react';
import { useAgent } from '../../lib/state';
import { useArenaStore } from '../../lib/state/arena';
import { useWalletStore } from '../../lib/state/wallet';
import styles from './Arena.module.css';

const StatPanel = ({ icon, label, value }: { icon: string; label: string; value: number }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        if (value === displayValue) return;

        const duration = 1000;
        const startTime = Date.now();
        const startValue = displayValue;

        const tick = () => {
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime >= duration) {
                setDisplayValue(value);
                return;
            }
            const progress = 1 - Math.pow(1 - (elapsedTime / duration), 3); // Ease-out cubic
            const currentVal = Math.round(startValue + (value - startValue) * progress);
            setDisplayValue(currentVal);
            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <div className={styles.statPanel}>
            <div className={styles.statIcon}><span className="icon">{icon}</span></div>
            <div className={styles.statValue}>{displayValue.toLocaleString()}</div>
            <div className={styles.statLabel}>{label}</div>
        </div>
    );
};


export default function ArenaStatsDisplay() {
    const { availablePresets, availablePersonal } = useAgent();
    const { rooms, activeConversations, lastSyncTimestamp } = useArenaStore();
    const { transactions } = useWalletStore();
    
    // Use lastSyncTimestamp in the dependency array to ensure this component
    // re-renders when the world state is updated

    const totalAgents = availablePresets.length + availablePersonal.length;
    const activeRooms = rooms.filter(r => r.agentIds.length > 0).length;
    // Count rooms with recent activity (within the last 30 seconds) as "live conversations"
    const liveConversations = Object.entries(activeConversations).filter(([roomId, timestamp]) => {
        // Check if the room exists and has 2 agents
        const room = rooms.find(r => r.id === roomId);
        if (!room || room.agentIds.length !== 2) return false;
        
        // Consider a conversation "live" if there was activity in the last 30 seconds
        return Date.now() - timestamp < 30000;
    }).length;
    const totalTransactions = transactions.filter(tx => tx.type === 'send').length; // Count only send transactions for trades

    return (
        <div className={styles.arenaStatsDisplay}>
            <StatPanel icon="groups" label="Total Quants" value={totalAgents} />
            <StatPanel icon="meeting_room" label="Active Rooms" value={activeRooms} />
            <StatPanel icon="forum" label="Live Conversations" value={liveConversations} />
            <StatPanel icon="swap_horiz" label="BOX Trades" value={totalTransactions} />
        </div>
    );
}