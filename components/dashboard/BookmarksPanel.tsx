
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUser, useUI } from '../../lib/state/index.js';
import { MarketIntel } from '../../lib/types/index.js';
import styles from './Dashboard.module.css';
import { useState, useEffect } from 'react';
import { apiService } from '../../lib/services/api.service.js';

const MarketItem = ({ market, onSelect }: { market: MarketIntel, onSelect: () => void }) => (
    <div className={styles.marketItem} onClick={onSelect}>
        <p className={styles.marketItemTitle}>{market.title}</p>
        <div className={styles.marketItemOdds}>
            <span>YES: {(market.odds.yes * 100).toFixed(0)}¢</span>
            <span>NO: {(market.odds.no * 100).toFixed(0)}¢</span>
        </div>
    </div>
);

export default function BookmarksPanel() {
    const { bookmarkedMarketIds } = useUser();
    const { openMarketDetailModal } = useUI();
    const [markets, setMarkets] = useState<MarketIntel[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchBookmarkedMarkets = async () => {
            if (!bookmarkedMarketIds || bookmarkedMarketIds.length === 0) {
                setMarkets([]);
                return;
            }
            setIsLoading(true);
            try {
                const fetchedMarkets = await apiService.request<MarketIntel[]>('/api/markets/by-ids', {
                    method: 'POST',
                    body: JSON.stringify({ ids: bookmarkedMarketIds }),
                });
                setMarkets(fetchedMarkets);
            } catch (error) {
                console.error("Failed to fetch bookmarked markets:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchBookmarkedMarkets();
    }, [bookmarkedMarketIds]);

    if (isLoading) {
        return <p className={styles.empty}>Loading bookmarks...</p>;
    }

    return (
        <div className={styles.marketList}>
            {markets.length > 0 ? (
                markets.map(market => (
                    <MarketItem 
                        key={market.id} 
                        market={market} 
                        onSelect={() => openMarketDetailModal(market)} 
                    />
                ))
            ) : (
                <p className={styles.empty}>No markets bookmarked yet. Click the bookmark icon on a market to save it here.</p>
            )}
        </div>
    );
}
