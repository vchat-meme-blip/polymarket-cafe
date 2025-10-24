/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent, useUI } from '../../lib/state/index.js';
import { MarketWatchlist } from '../../lib/types/index.js';
import styles from './Dashboard.module.css';

const WatchlistItem = ({ watchlist }: { watchlist: MarketWatchlist }) => {
    const { setChatPrompt } = useUI();

    const handleClick = () => {
        let prompt = `Tell me about my watchlist "${watchlist.name}".`;
        if (watchlist.wallets && watchlist.wallets.length > 0) {
            prompt = `Analyze the wallets on my "${watchlist.name}" watchlist. What are they trading? The addresses are: ${watchlist.wallets.join(', ')}.`;
        } else if (watchlist.markets && watchlist.markets.length > 0) {
            prompt = `Give me an update on the markets in my "${watchlist.name}" watchlist.`;
        }
        setChatPrompt(prompt);
    };
    
    const hasWallets = watchlist.wallets && watchlist.wallets.length > 0;
    const hasMarkets = watchlist.markets && watchlist.markets.length > 0;

    return (
        <div className={`${styles.intelBankItem} ${styles.clickable}`} onClick={handleClick}>
            <div className={styles.intelBankItemHeader}>
                <div className={styles.intelBankItemToken}>
                    <span className="icon">visibility</span>
                    {watchlist.name}
                </div>
            </div>
            <p className={styles.intelBankItemSummary}>
                {hasWallets ? `Tracking ${watchlist.wallets!.length} wallet(s).` : ''}
                {hasWallets && hasMarkets ? ' ' : ''}
                {hasMarkets ? `Tracking ${watchlist.markets.length} market(s).` : ''}
                {!hasWallets && !hasMarkets ? 'Empty watchlist.' : ''}
            </p>
        </div>
    );
};

export default function WatchlistPanel() {
    const { current: agent } = useAgent();
    const watchlists = agent.marketWatchlists || [];

    return (
        <div className={styles.intelBankList}>
            {watchlists.length > 0 ? (
                watchlists.map(list => (
                    <WatchlistItem key={list.id} watchlist={list} />
                ))
            ) : (
                <p className={styles.empty}>No watchlists created yet. Your agent can create these based on your research.</p>
            )}
        </div>
    );
}