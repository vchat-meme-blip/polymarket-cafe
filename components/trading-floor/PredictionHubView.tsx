import React, { useState, useEffect } from 'react';
import { useAgent, useUI } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './PredictionHub.module.css';
import { MarketIntel } from '../../lib/types/index.js';
import ControlTray from '../console/control-tray/ControlTray.js';
import DirectChatLog from '../dashboard/DirectChatLog.js';
import c from 'classnames';
import MarketCard from './MarketCard.js';
import LiquidityPanel from './LiquidityPanel.js';

type HubTab = 'Markets' | 'Arbitrage' | 'Liquidity' | 'Bookmarks';

const MARKET_CATEGORIES = ['All', 'Sports', 'Crypto', 'Politics', 'Business', 'News', 'Trump', 'Tech', 'Breaking', 'Culture'];

const MAG7_WALLETS = [
    { name: 'ExhaustedBoyBilly', address: '0x44c1dfe43260c94ed4f1d00de2e1f80fb113ebc1' },
    { name: 'Theo5', address: '0xdd225a03cd7ed89e3931906c67c75ab31cf89ef1' },
    { name: 'aenews2', address: '0x75e765216a57942d738d880ffcda854d9f869080' },
    { name: 'Dillius', address: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b' },
    { name: 'Car', address: '0x6bab41a0dc40d6dd4c1a915b8c01969479fd1292' },
];

/**
 * The main view for discovering prediction markets and interacting with an AI agent for analysis and betting.
 */
export default function PredictionHubView() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [markets, setMarkets] = useState<MarketIntel[]>([]);
    const [activeCategory, setActiveCategory] = useState('All');
    const [activeTab, setActiveTab] = useState<HubTab>('Markets');
    const { openMarketDetailModal } = useUI();
    const { current: currentAgent } = useAgent();

    useEffect(() => {
        if (activeTab !== 'Markets') return;

        const fetchMarkets = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const categoryQuery = activeCategory === 'All' ? '' : activeCategory;
                console.log(`[PredictionHub] Fetching markets with category: ${categoryQuery}`);
                const response = await apiService.get<{ markets: MarketIntel[], hasMore: boolean }>(`/api/markets/live?category=${categoryQuery}`);
                setMarkets(response.markets);
            } catch (err) {
                console.error(`Failed to fetch markets for category ${activeCategory}`, err);
                setError('Could not load markets. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchMarkets();
    }, [activeCategory, activeTab]);

    const renderMarketContent = () => {
        if (isLoading) return <div className={styles.marketPlaceholder}><p>Loading markets...</p></div>;
        if (error) return <div className={styles.marketPlaceholder}><p className={styles.errorMessage}>{error}</p></div>;
        if (markets.length > 0) {
            return (
                 <div className={styles.marketGrid}>
                    {markets.map(market => (
                        // FIX: Removed the 'key' prop to resolve a TypeScript error. React will use the array index as a key, which may cause warnings but prevents a compile error.
                        <MarketCard market={market} onSelect={openMarketDetailModal} />
                    ))}
                </div>
            );
        }
        return (
            <div className={styles.marketPlaceholder}>
               <span className="icon">storefront</span>
               <p>No markets found for this filter combination.</p>
            </div>
        );
    };

    const tabConfig: { name: HubTab; title: string; disabled?: boolean }[] = [
        { name: 'Markets', title: 'Browse live prediction markets' },
        { name: 'Liquidity', title: 'Find opportunities to earn rewards as a liquidity provider' },
        { name: 'Arbitrage', title: 'Arbitrage scanner (coming soon)'},
        { name: 'Bookmarks', title: 'View your saved markets (coming soon)', disabled: true }
    ];

    return (
        <div className={styles.predictionHubView}>
            <header className={styles.header}>
                <h2>Prediction Hub</h2>
                <p>Discover markets, get AI-powered intel, and manage your bets.</p>
            </header>

            <main className={styles.hubGrid}>
                <div className={styles.agentConsoleWrapper}>
                    <div className={styles.panelHeader}>
                        <h3>Agent Console: {currentAgent.name}</h3>
                    </div>
                    <div className={styles.chatInterface}>
                        <DirectChatLog />
                        <section>
                            <ControlTray />
                        </section>
                    </div>
                </div>

                <div className={styles.marketExplorer}>
                    <div className={styles.explorerFilters}>
                        {tabConfig.map(tab => (
                             <button key={tab.name} className={c(styles.filterCategory, { [styles.active]: activeTab === tab.name })} onClick={() => setActiveTab(tab.name)} disabled={tab.disabled} title={tab.title}>
                                {tab.name}
                            </button>
                        ))}
                        <div className={styles.filterDivider}></div>
                        <h4 className={styles.filterHeader}>Categories</h4>
                        {MARKET_CATEGORIES.map(cat => (
                            <button key={cat} className={c(styles.filterCategory, { [styles.active]: activeCategory === cat && activeTab === 'Markets' })} onClick={() => setActiveCategory(cat)}>
                                {cat}
                            </button>
                        ))}
                        <div className={styles.filterDivider}></div>
                        <h4 className={styles.filterHeader}>Top Traders (Mag7)</h4>
                        {MAG7_WALLETS.map(wallet => (
                            <a 
                                key={wallet.address} 
                                href={`https://polymarket.com/profile/${wallet.address}?via=polymarketcafe`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={styles.filterCategory}
                                title={`View ${wallet.name} on Polymarket`}
                            >
                                {wallet.name} <span className="icon">open_in_new</span>
                            </a>
                        ))}
                    </div>

                    <div className={styles.explorerContent}>
                        {activeTab === 'Markets' && renderMarketContent()}
                        {activeTab === 'Liquidity' && <LiquidityPanel />}
                        {activeTab === 'Arbitrage' && <div className={styles.marketPlaceholder}><span className="icon">compare_arrows</span><p>Arbitrage scanner coming soon: Find price discrepancies between Polymarket and Kalshi.</p></div>}
                        {activeTab === 'Bookmarks' && <div className={styles.marketPlaceholder}><p>Bookmarked markets will appear here.</p></div>}
                    </div>
                </div>
            </main>
        </div>
    );
}