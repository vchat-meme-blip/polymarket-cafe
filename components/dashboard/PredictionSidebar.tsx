
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { apiService } from '../../lib/services/api.service.js';
import { MarketIntel } from '../../lib/types/index.js';
import { useUI } from '../../lib/state/index.js';
import styles from './Dashboard.module.css';

const MarketItem = ({ market, onSelect }: { market: MarketIntel, onSelect: () => void }) => (
    <div className={styles.marketItem} onClick={onSelect}>
        <p className={styles.marketItemTitle}>{market.title}</p>
        <div className={styles.marketItemOdds}>
            <span>YES: {(market.odds.yes * 100).toFixed(0)}¢</span>
            <span>NO: {(market.odds.no * 100).toFixed(0)}¢</span>
        </div>
    </div>
);

export default function PredictionSidebar() {
    const [markets, setMarkets] = useState<MarketIntel[]>([]);
    const { setView } = useUI();

    useEffect(() => {
        const fetchMarkets = async () => {
            try {
                const { markets: liveMarkets } = await apiService.getLiveMarkets();
                setMarkets(liveMarkets.slice(0, 10)); // Show top 10
            } catch (error) {
                console.error("Failed to fetch markets for sidebar", error);
            }
        };
        fetchMarkets();
    }, []);

    return (
        <>
            <div className={styles.marketList}>
                {markets.length > 0 ? (
                    markets.map(market => (
                        <MarketItem key={market.id} market={market} onSelect={() => setView('prediction-hub')} />
                    ))
                ) : (
                    <p>Loading markets...</p>
                )}
            </div>
             <button className="button" onClick={() => setView('prediction-hub')} style={{width: '100%', justifyContent: 'center', marginTop: 'auto'}}>
                View All Markets
            </button>
        </>
    );
}