/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect } from 'react';
import Modal from '../Modal';
import { useUI } from '../../lib/state';
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

export default function ServerHealthModal() {
    const { closeServerHealthModal } = useUI();
    const [stats, setStats] = useState<ServerStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await fetch('/api/stats');
                if (!response.ok) throw new Error('Failed to fetch stats');
                const data = await response.json();
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
                        </div>
                        <div className={styles.statsCategory}>
                            <h4>Simulation</h4>
                            <StatDisplay label="Total Agents" value={stats.simulation.totalAgents} icon="groups" />
                            <StatDisplay label="Active Rooms" value={stats.simulation.activeRooms} icon="meeting_room" />
                            <StatDisplay label="Live Conversations" value={stats.simulation.liveConversations} icon="forum" />
                            <StatDisplay label="Total Trades" value={stats.simulation.totalTrades} icon="swap_horiz" />
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
