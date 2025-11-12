
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState, useMemo } from 'react';
import { useAgent } from '../../lib/state/index.js';
import { useArenaStore } from '../../lib/state/arena';
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
    const { rooms, activeConversations, tradeHistory } = useArenaStore();
    
    const storefronts = useMemo(() => rooms.filter(r => r.isOwned), [rooms]);

    const totalStorefronts = storefronts.length;
    const activeStorefronts = storefronts.filter(r => r?.agentIds?.length > 0).length;
    
    const liveConversations = useMemo(() => {
        return Object.entries(activeConversations).filter(([roomId, timestamp]) => {
            const room = storefronts.find(r => r.id === roomId);
            if (!room || !room.agentIds || room.agentIds.length !== 2) return false;
            return Date.now() - Number(timestamp) < 30000;
        }).length;
    }, [activeConversations, storefronts]);

    const totalTrades = tradeHistory.length;

    return (
        <div className={styles.arenaStatsDisplay}>
            <StatPanel icon="store" label="Storefronts" value={totalStorefronts} />
            <StatPanel icon="meeting_room" label="Active Stores" value={activeStorefronts} />
            <StatPanel icon="forum" label="Live Chats" value={liveConversations} />
            <StatPanel icon="swap_horiz" label="Intel Trades" value={totalTrades} />
        </div>
    );
}
