import React from 'react';
import { useUI } from '../../lib/state/index.js';
import styles from './PredictionHub.module.css';
import { MarketIntel } from '../../lib/types/index.js';

export default function MarketCard({ market, onSelect }: { market: MarketIntel, onSelect: (market: MarketIntel) => void }) {
    const isBinary = market.outcomes.length === 2 && market.outcomes.some(o => o.name === 'Yes') && market.outcomes.some(o => o.name === 'No');

    return (
        <div className={styles.marketCard} onClick={() => onSelect(market)}>
            <div className={styles.marketHeader}>
                {market.imageUrl && <img src={market.imageUrl} alt="" className={styles.marketImage} />}
                <p className={styles.marketTitle}>{market.title}</p>
            </div>
            <div className={styles.marketBody}>
                {isBinary ? (
                    <div className={styles.binaryOutcome}>
                        <div className={styles.binaryButtons}>
                            <div className={`${styles.binaryButton} ${styles.yes}`}>
                                <span>Yes</span>
                                <span>{Math.round(market.odds.yes * 100)}¢</span>
                            </div>
                             <div className={`${styles.binaryButton} ${styles.no}`}>
                                <span>No</span>
                                <span>{Math.round(market.odds.no * 100)}¢</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className={styles.categoricalOutcomes}>
                        {market.outcomes.map(outcome => (
                            <div key={outcome.name} className={styles.outcomeRow}>
                                <span className={styles.outcomeName}>{outcome.name}</span>
                                <span className={styles.outcomePrice}>{Math.round(outcome.price * 100)}¢</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className={styles.marketFooter}>
                <div className={styles.marketVolume}>
                    <span className="icon">paid</span>
                    <span>${market.volume > 1000 ? `${(market.volume/1000).toFixed(1)}k` : market.volume.toFixed(0)}</span>
                </div>
                <div className={styles.marketPlatform}>{market.platform}</div>
            </div>
        </div>
    );
};