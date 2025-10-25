import { useMemo } from 'react';
import { useAgent, useUser, useUI } from '../../lib/state';
import { useArenaStore } from '../../lib/state/arena';
import styles from './Leaderboard.module.css';

const AGENT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', 
  '#9b59b6', '#e67e22', '#1abc9c', '#e84393'
];

export default function LeaderboardView() {
    const { availablePersonal, availablePresets } = useAgent();
    const { handle: userHandle } = useUser();
    const { tradeHistory } = useArenaStore();
    const { openShareModal } = useUI();
    const allAgents = useMemo(() => [...availablePersonal, ...availablePresets], [availablePersonal, availablePresets]);

    const rankedAgents = useMemo(() => {
        return allAgents
            .filter(agent => agent != null) // Filter out any null/undefined agents
            .map(agent => {
                const trades = tradeHistory.filter(t => t?.fromId === agent?.id || t?.toId === agent?.id).length;
                const reputation = agent?.reputation || 0;
                const boxBalance = agent?.boxBalance || 0;
                
                // Performance Score Calculation with safe defaults
                const score = Math.floor(
                    (reputation * 10) +
                    (boxBalance) +
                    (trades * 50)
                );

                return {
                    ...agent,
                    trades,
                    score,
                    reputation,
                    boxBalance,
                };
            })
            .sort((a, b) => (b?.score || 0) - (a?.score || 0));
    }, [allAgents, tradeHistory]);

    return (
        <div className={styles.leaderboardView}>
            <h2>Leaderboard</h2>
            <table className={styles.leaderboardTable}>
                <thead>
                    <tr>
                        <th className={styles.rankCell}>Rank</th>
                        <th>Agent</th>
                        <th className={styles.statCell}>Reputation</th>
                        <th className={styles.statCell}>BOX Balance</th>
                        <th className={styles.statCell}>Trades</th>
                        <th className={styles.scoreCell}>Score</th>
                        <th className={styles.shareCell}></th>
                    </tr>
                </thead>
                <tbody>
                    {rankedAgents.map((agent, index) => {
                        const rank = index + 1;
                        const isUserAgent = agent.ownerHandle === userHandle;
                        const color = AGENT_COLORS[agent.name.charCodeAt(0) % AGENT_COLORS.length];
                        return (
                            <tr key={agent.id} className={isUserAgent ? styles.userRow : ''}>
                                <td className={styles.rankCell} data-label="Rank">#{rank}</td>
                                <td data-label="Agent">
                                    <div className={styles.agentCell}>
                                        <div className={styles.agentAvatar} style={{ backgroundColor: color }}>
                                            {agent.name.charAt(0)}
                                        </div>
                                        <span className={styles.agentName}>{agent.name}</span>
                                    </div>
                                </td>
                                <td className={styles.statCell} data-label="Reputation">{agent?.reputation?.toLocaleString() || '0'}</td>
                                <td className={styles.statCell} data-label="BOX Balance">{(agent?.boxBalance || 0).toLocaleString()}</td>
                                <td className={styles.statCell} data-label="Trades">{agent?.trades || 0}</td>
                                <td className={styles.scoreCell} data-label="Score">{(agent?.score || 0).toLocaleString()}</td>
                                <td className={styles.shareCell} data-label="Actions">
                                    {isUserAgent && (
                                        <button className="button" onClick={() => openShareModal({ agent, rank, score: agent.score })}>
                                            <span className="icon">share</span> Share
                                        </button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}