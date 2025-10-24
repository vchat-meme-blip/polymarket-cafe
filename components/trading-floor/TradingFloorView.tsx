
import { useState, useEffect } from 'react';
import { useAgent, useUI } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './PredictionHub.module.css';
import { MarketIntel, AgentMode } from '../../lib/types/index.js';
import ControlTray from '../console/control-tray/ControlTray.js';
import DirectChatLog from '../dashboard/DirectChatLog.js';
import c from 'classnames';

type HubTab = 'Markets' | 'Arbitrage' | 'Liquidity' | 'Bookmarks';

const MARKET_CATEGORIES = ['All', 'Sports', 'Crypto', 'Politics', 'Business', 'News'];

const MarketCard = ({ market, onSelect }: { market: MarketIntel, onSelect: (market: MarketIntel) => void }) => (
    <div className={styles.marketCard} onClick={() => onSelect(market)}>
        {market.imageUrl && <img src={market.imageUrl} alt={market.title} className={styles.marketImage} />}
        <p className={styles.marketTitle}>{market.title}</p>
        <div className={styles.marketOdds}>
            <div className={styles.odd} style={{ '--bar-width': `${market.odds.yes * 100}%` } as React.CSSProperties}>
                <span>Yes</span>
                <span>{(market.odds.yes * 100).toFixed(0)}¢</span>
            </div>
            <div className={styles.odd} style={{ '--bar-width': `${market.odds.no * 100}%` } as React.CSSProperties}>
                <span>No</span>
                <span>{(market.odds.no * 100).toFixed(0)}¢</span>
            </div>
        </div>
        <div className={styles.marketMeta}>
            <span>Vol: ${market.volume.toLocaleString()}</span>
            <span>Liq: ${market.liquidity.toLocaleString()}</span>
        </div>
    </div>
);

const AgentModeSelector = () => {
    const { current: currentAgent, setCurrentAgentMode } = useAgent();
    const activeMode = currentAgent.mode;

    const modes: { name: AgentMode; description: string }[] = [
        { name: 'Safe', description: 'Prioritize high-probability, low-return bets with high liquidity.' },
        { name: 'Degen', description: 'Look for high-risk, high-reward opportunities on new markets.' },
        { name: 'Mag7', description: 'Simulate top trader behavior by focusing on high-volume markets.' }
    ];

    return (
        <div className={styles.agentModeSelector}>
            {modes.map(mode => (
                <button 
                    key={mode.name}
                    className={`${styles.modeButton} ${activeMode === mode.name ? styles.active : ''}`}
                    onClick={() => setCurrentAgentMode(mode.name)}
                    title={mode.description}
                >
                    {mode.name}
                </button>
            ))}
        </div>
    );
};


const LiquidityPanel = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [markets, setMarkets] = useState<MarketIntel[]>([]);
    const { openMarketDetailModal } = useUI();

    useEffect(() => {
        const fetchLiquidity = async () => {
            setIsLoading(false);
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
                const modeQuery = currentAgent.mode;
                const fetchedMarkets = await apiService.get<MarketIntel[]>(`/api/markets/live?category=${categoryQuery}&mode=${modeQuery}`);
                setMarkets(fetchedMarkets);
            } catch (err) {
                console.error(`Failed to fetch markets for category ${activeCategory}`, err);
                setError('Could not load markets. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchMarkets();
    }, [activeCategory, currentAgent.mode, activeTab]);

    const renderMarketContent = () => {
        if (isLoading) return <div className={styles.marketPlaceholder}><p>Loading markets...</p></div>;
        if (error) return <div className={styles.marketPlaceholder}><p className={styles.errorMessage}>{error}</p></div>;
        if (markets.length > 0) {
            return (
                 <div className={styles.marketGrid}>
                    {markets.map(market => (
                        <MarketCard key={market.id} market={market} onSelect={openMarketDetailModal} />
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
                        <h3>Agent Console</h3>
                        <AgentModeSelector />
                    </div>
                    <div className={styles.chatInterface}>
                        <DirectChatLog />
                        <ControlTray />
                    </div>
                </div>

                <div className={styles.marketExplorer}>
                    <div className={styles.explorerFilters}>
                        {tabConfig.map(tab => (
                             <button key={tab.name} className={c(styles.filterCategory, { [styles.active]: activeTab === tab.name })} onClick={() => setActiveTab(tab.name)} disabled={tab.disabled}>
                                {tab.name}
                            </button>
                        ))}
                        <div className={styles.filterDivider}></div>
                        {MARKET_CATEGORIES.map(cat => (
                            <button key={cat} className={c(styles.filterCategory, { [styles.active]: activeCategory === cat })} onClick={() => setActiveCategory(cat)}>
                                {cat}
                            </button>
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
