/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { useAgent, useUI } from '../../lib/state/index.js';
import styles from './Leaderboard.module.css';
import { Agent } from '../../lib/types/index.js';
import { apiService } from '../../lib/services/api.service.js';

type LeaderboardTab = 'pnl' | 'intel';

type PnlLeaderboardEntry = {
    agentId: string;
    agentName: string;
    agentModelUrl: string;
    totalPnl: number;
    totalBets: number;
    winRate: number;
};

type IntelLeaderboardEntry = {
    agentId: string;
    agentName: string;
    agentModelUrl: string;
    totalIntelPnl: number;
    intelPiecesSold: number;
};


export default function LeaderboardView() {
    const { current: userAgent } = useAgent();
    const { openShareModal } = useUI();
    const [activeTab, setActiveTab] = useState<LeaderboardTab>('pnl');
    const [pnlData, setPnlData] = useState<PnlLeaderboardEntry[]>([]);
    const [intelData, setIntelData] = useState<IntelLeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                if (activeTab === 'pnl') {
                    const data = await apiService.get<PnlLeaderboardEntry[]>('/api/leaderboard/pnl');
                    setPnlData(data);
                } else {
                    const data = await apiService.get<IntelLeaderboardEntry[]>('/api/leaderboard/intel');
                    setIntelData(data);
                }
            } catch (error) {
                console.error(`Failed to fetch ${activeTab} leaderboard:`, error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [activeTab]);


    const handleShare = (agentName: string, rank: number, score: number) => {
        // A simplified share action
        alert(`Sharing ${agentName}'s Rank #${rank} with a score of ${score.toLocaleString()}`);
    };

    const renderPnlTable = () => (
        <table className={styles.leaderboardTable}>
            <thead>
                <tr>
                    <th className={styles.rankCell}>Rank</th>
                    <th>Agent</th>
                    <th className={styles.scoreCell}>Total P&L (USD)</th>
                    <th className={styles.statCell}>Total Bets</th>
                    <th className={styles.statCell}>Win Rate</th>
                </tr>
            </thead>
            <tbody>
                {pnlData.map((entry, index) => (
                    <tr key={entry.agentId} className={entry.agentId === userAgent.id ? styles.userRow : ''}>
                        <td data-label="Rank" className={styles.rankCell}>#{index + 1}</td>
                        <td data-label="Agent" className={styles.agentCell}>
                            <div className={styles.agentAvatar} style={{backgroundImage: `url(${entry.agentModelUrl})`}}>
                                {!entry.agentModelUrl && entry.agentName.charAt(0)}
                            </div>
                            <span className={styles.agentName}>{entry.agentName}</span>
                        </td>
                        <td data-label="Total P&L" className={styles.scoreCell}>${entry.totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td data-label="Total Bets" className={styles.statCell}>{entry.totalBets}</td>
                        <td data-label="Win Rate" className={styles.statCell}>{(entry.winRate * 100).toFixed(1)}%</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderIntelTable = () => (
        <table className={styles.leaderboardTable}>
            <thead>
                <tr>
                    <th className={styles.rankCell}>Rank</th>
                    <th>Agent</th>
                    <th className={styles.scoreCell}>Intel P&L (USD)</th>
                    <th className={styles.statCell}>Intel Pieces Sold</th>
                </tr>
            </thead>
            <tbody>
                {intelData.map((entry, index) => (
                    <tr key={entry.agentId} className={entry.agentId === userAgent.id ? styles.userRow : ''}>
                        <td data-label="Rank" className={styles.rankCell}>#{index + 1}</td>
                        <td data-label="Agent" className={styles.agentCell}>
                            <div className={styles.agentAvatar} style={{backgroundImage: `url(${entry.agentModelUrl})`}}>
                                {!entry.agentModelUrl && entry.agentName.charAt(0)}
                            </div>
                            <span className={styles.agentName}>{entry.agentName}</span>
                        </td>
                        <td data-label="Intel P&L" className={styles.scoreCell}>${entry.totalIntelPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td data-label="Intel Sold" className={styles.statCell}>{entry.intelPiecesSold}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderEmptyState = () => (
        <div className={styles.emptyState}>
            <span className="icon">query_stats</span>
            <p>No data available yet. The Arena is still calculating results!</p>
        </div>
    );

    return (
        <div className={styles.leaderboardView}>
            <h2>Leaderboard</h2>
            <div className={styles.leaderboardTabs}>
                <button 
                    className={`${styles.tabButton} ${activeTab === 'pnl' ? styles.active : ''}`}
                    onClick={() => setActiveTab('pnl')}
                >
                    Betting PNL
                </button>
                <button 
                    className={`${styles.tabButton} ${activeTab === 'intel' ? styles.active : ''}`}
                    onClick={() => setActiveTab('intel')}
                >
                    Intel PNL
                </button>
            </div>

            {isLoading ? (
                <div className={styles.emptyState}><p>Loading leaderboard...</p></div>
            ) : (
                (activeTab === 'pnl' && pnlData.length > 0) ? renderPnlTable() :
                (activeTab === 'intel' && intelData.length > 0) ? renderIntelTable() :
                renderEmptyState()
            )}
        </div>
    );
}