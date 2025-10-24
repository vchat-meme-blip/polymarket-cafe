import { useState, useEffect } from 'react';
import { useUI } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './PredictionHub.module.css';
import { MarketIntel } from '../../lib/types/index.js';
import MarketCard from './MarketCard.js';

export default function LiquidityPanel() {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [markets, setMarkets] = useState<MarketIntel[]>([]);
    const { openMarketDetailModal } = useUI();

    useEffect(() => {
        const fetchLiquidity = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const fetchedMarkets = await apiService.get<MarketIntel[]>('/api/markets/liquidity');
                setMarkets(fetchedMarkets);
            } catch (err) {
                 setError('Could not load liquidity opportunities.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLiquidity();
    }, []);

    return (
        <div className={styles.liquidityPanel}>
            <div className={styles.liquidityExplainer}>
                <h4>Provide Liquidity</h4>
                <p>Earn fees and rewards by providing liquidity to markets. This is a higher-risk, higher-reward strategy for advanced users.</p>
            </div>
             {isLoading ? (
                <div className={styles.marketPlaceholder}><p>Loading liquidity opportunities...</p></div>
            ) : error ? (
                <div className={styles.marketPlaceholder}><p className={styles.errorMessage}>{error}</p></div>
            ) : markets.length > 0 ? (
                <div className={styles.marketGrid}>
                    {markets.map(market => (
                        <MarketCard key={market.id} market={market} onSelect={openMarketDetailModal} />
                    ))}
                </div>
            ) : (
                 <div className={styles.marketPlaceholder}>
                    <span className="icon">liquidity</span>
                    <p>No special liquidity opportunities found right now.</p>
                </div>
            )}
        </div>
    );
};