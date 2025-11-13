/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect } from 'react';
import Modal from '../Modal';
import { useUI } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import { MarketIntel } from '../../lib/types/index.js';
import styles from './Modals.module.css';
import { format, formatDistanceToNow, isSameDay } from 'date-fns';

type GroupedMarkets = {
    [key: string]: {
        label: string;
        markets: (MarketIntel & { detectedAt: number })[];
    };
};

const MarketItem = ({ market, onSelect }: { market: MarketIntel, onSelect: () => void }) => (
    <div className={styles.marketItem} onClick={onSelect}>
        <p className={styles.marketItemTitle}>{market.title}</p>
        <div className={styles.marketItemOdds}>
            <span>YES: {(market.odds.yes * 100).toFixed(0)}¢</span>
            <span>NO: {(market.odds.no * 100).toFixed(0)}¢</span>
        </div>
    </div>
);

export default function NewMarketsModal() {
    const { closeNewMarketsModal, openMarketDetailModal } = useUI();
    const [groupedMarkets, setGroupedMarkets] = useState<GroupedMarkets>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchNewMarkets = async () => {
            setIsLoading(true);
            try {
                const markets = await apiService.request<(MarketIntel & { detectedAt: number })[]>('/api/markets/new-cached');
                
                const groups: GroupedMarkets = {};
                markets.forEach(market => {
                    const date = new Date(market.detectedAt);
                    const dayKey = format(date, 'yyyy-MM-dd');
                    if (!groups[dayKey]) {
                        groups[dayKey] = {
                            label: isSameDay(date, new Date()) ? 'Today' : format(date, 'MMMM d, yyyy'),
                            markets: []
                        };
                    }
                    groups[dayKey].markets.push(market);
                });
                
                setGroupedMarkets(groups);
            } catch (error) {
                console.error('Failed to fetch new markets:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchNewMarkets();
    }, []);
    
    const handleSelectMarket = (market: MarketIntel) => {
        closeNewMarketsModal();
        openMarketDetailModal(market);
    };

    return (
        <Modal onClose={closeNewMarketsModal}>
            <div className={`${styles.modalContentPane} ${styles.newMarketsModal}`}>
                <div className={styles.modalHeader}>
                    <h2>Recently Discovered Markets</h2>
                </div>
                <div className={styles.marketListContainer}>
                    {isLoading ? (
                        <p>Loading...</p>
                    ) : Object.keys(groupedMarkets).length > 0 ? (
                        Object.entries(groupedMarkets).map(([dayKey, group]) => (
                            <div key={dayKey} className={styles.marketGroup}>
                                <h4 className={styles.marketGroupTitle}>{group.label}</h4>
                                <div className={styles.marketList}>
                                    {group.markets.map(market => (
                                        <MarketItem key={market.id} market={market} onSelect={() => handleSelectMarket(market)} />
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className={styles.empty}>No new markets found recently.</p>
                    )}
                </div>
            </div>
        </Modal>
    );
}