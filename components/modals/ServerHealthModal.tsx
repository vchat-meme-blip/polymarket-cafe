/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect, useRef } from 'react';
import Modal from '../Modal';
// FIX: Fix imports for `useUI`, `useSystemLogStore`, and `LogEntry` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useUI, useSystemLogStore, LogEntry } from '../../lib/state/index.js';
// FIX: Add .js extension for ES module compatibility.
import { apiService } from '../../lib/services/api.service.js';
import format from 'date-fns/format';
import c from 'classnames';
import styles from './Modals.module.css';

interface ServerStats {
    directors: {
        autonomy: { status: string; lastTick: string };
        arena: { status: string; lastTick: string };
    };
    simulation: {
        totalAgents: number;
        activeRooms: number;
        liveConversations: number;
        totalTrades: number;
    };
}

const StatDisplay = ({ label, value, icon, status }: { label: string; value: string | number; icon: string; status?: 'Running' | 'Stopped' }) => (
    <div className={styles.statItem}>
        <div className={styles.statIconWrapper}>
            <span className="icon">{icon}</span>
            {status && (
                <div
                    className={`${styles.statusIndicator} ${status === 'Running' ? styles.running : styles.stopped}`}
                    title={status}
                ></div>
            )}
        </div>
        <div className={styles.statInfo}>
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statLabel}>{label}</span>
        </div>
    </div>
);

// FIX: Define LOG_ICONS to be used in the ActivityFeed component.
const LOG_ICONS: Record<LogEntry['type'], string> = {
  move: 'open_with',
  conversation: 'forum',
  intel: 'lightbulb',
  system: 'dns',
};

const ActivityFeed = () => {
    const logs = useSystemLogStore(state => state.logs);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [logs]);
    
    return (
        <div className={styles.statsCategory}>
            <h4>Live Activity Feed</h4>
            <div className={styles.activityLog} ref={scrollRef}>
                {logs.length === 0 ? (
                    <p>No activity yet. The simulation is warming up...</p>
                ) : (
                    logs.map(log => (
                        <div key={log.id} className={styles.activityItem}>
                            <div className={styles.activityHeader}>
                                <span className={c("icon", styles.activityIcon, styles[log.type])}>{LOG_ICONS[log.type]}</span>
                                <span className={styles.activityType}>{log.type}</span>
                                <span className={styles.activityTimestamp}>{format(log.timestamp, 'HH:mm:ss')}</span>
                            </div>
                            <p className={styles.activityDescription}>{log.message}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};


export default function ServerHealthModal() {
    const { closeServerHealthModal } = useUI();
    const [stats, setStats] = useState<ServerStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // FIX: Use the centralized apiService to ensure the correct endpoint is called.
                const data = await apiService.get<ServerStats>('/api/stats');
                setStats(data);
            } catch (error) {
                console.error("Error fetching server health:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds

        return () => clearInterval(interval);
    }, []);


    return (
        <Modal onClose={closeServerHealthModal}>
            <div className={`${styles.modalContentPane} ${styles.serverHealthModal}`}>
                <div className={styles.modalHeader}>
                    <h2>Server Health</h2>
                </div>
                {isLoading ? (
                    <p>Loading server stats...</p>
                ) : !stats ? (
                    <p>Could not load server stats. Please try again later.</p>
                ) : (
                    <div className={styles.statsGrid}>
                        <div className={styles.statsCategory}>
                            <h4>Directors</h4>
                            <StatDisplay label="Autonomy Director" value={stats.directors.autonomy.status} icon="smart_toy" status={stats.directors.autonomy.status as 'Running'} />
                            <StatDisplay label="Arena Director" value={stats.directors.arena.status} icon="coffee" status={stats.directors.arena.status as 'Running'} />
                            
                            <h4 style={{marginTop: '20px'}}>Simulation</h4>
                            <StatDisplay label="Total Agents" value={stats.simulation.totalAgents} icon="groups" />
                            <StatDisplay label="Active Rooms" value={stats.simulation.activeRooms} icon="meeting_room" />
                            <StatDisplay label="Live Conversations" value={stats.simulation.liveConversations} icon="forum" />
                            <StatDisplay label="Total Trades" value={stats.simulation.totalTrades} icon="swap_horiz" />
                        </div>
                        <ActivityFeed />
                    </div>
                )}
            </div>
        </Modal>
    );
}