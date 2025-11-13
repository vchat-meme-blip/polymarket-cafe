
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import c from 'classnames';
import styles from './Dashboard.module.css';
import KeynoteCompanion from './KeynoteCompanion';
import DirectChatLog from './DirectChatLog';
import PredictionSidebar from './PredictionSidebar';
import { useAgent, useUI } from '../../lib/state/index.js';
import FirstAgentPrompt from '../onboarding/FirstAgentPrompt';
import ControlTray from '../console/control-tray/ControlTray.js';
import BetSlipPanel from './BetSlipPanel';
import BookmarksPanel from './BookmarksPanel.js';
import ArbitragePanel from './ArbitragePanel';
import LiquidityPanel from '../trading-floor/LiquidityPanel.js';
import OperationsCenter from './OperationsCenter';

type DashboardTab = 'betSlip' | 'markets' | 'bookmarks' | 'arbitrage' | 'liquidity' | 'newMarkets';

/**
 * The main dashboard view that aggregates various components into a single layout.
 * It shows the main agent interaction view and a sidebar with auxiliary information.
 */
export default function Dashboard() {
  const { availablePersonal, current: currentAgent } = useAgent();
  const { openAgentDossier, openNewMarketsModal } = useUI();
  const [activeTab, setActiveTab] = useState<DashboardTab>('betSlip');

  // If the user has no personal agents created yet, show a prompt to guide them to onboarding.
  if (availablePersonal.length === 0) {
    return <FirstAgentPrompt />;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'markets':
        return <PredictionSidebar />;
      case 'bookmarks':
        return <BookmarksPanel />;
      case 'arbitrage':
        return <ArbitragePanel />;
      case 'liquidity':
        return <LiquidityPanel />;
      case 'betSlip':
      default:
        return <BetSlipPanel />;
    }
  };

  return (
    <div className={styles.dashboardGrid}>
      <div className={styles.dashboardMain}>
        <button className={styles.intelBankButton} onClick={() => openAgentDossier(currentAgent.id, false, 'intel')}>
          <span className="icon">database</span> Intel Bank
        </button>
        <div className={styles.agentDisplay}>
          <KeynoteCompanion />
        </div>
        <div className={styles.chatPanel}>
          <DirectChatLog />
          <div className={styles.controlTray}>
            <ControlTray />
          </div>
        </div>
      </div>
      <div className={styles.dashboardRight}>
        <OperationsCenter />
        
        {/* Market-related tabbed panel remains */}
        <div className={styles.tabbedPanel}>
            <div className={styles.tabButtons}>
                <button 
                    className={c(styles.tabButton, {[styles.active]: activeTab === 'betSlip'})}
                    onClick={() => setActiveTab('betSlip')}
                    title="View your agent's current bet proposal"
                >
                    Bet Slip
                </button>
                <button 
                    className={c(styles.tabButton, {[styles.active]: activeTab === 'markets'})}
                    onClick={() => setActiveTab('markets')}
                    title="Discover trending markets"
                >
                    Markets
                </button>
                <button 
                    className={c(styles.tabButton, {[styles.active]: activeTab === 'bookmarks'})}
                    onClick={() => setActiveTab('bookmarks')}
                    title="Manage your bookmarked markets"
                >
                    Bookmarks
                </button>
                 <button 
                    className={c(styles.tabButton, {[styles.active]: activeTab === 'newMarkets'})}
                    onClick={openNewMarketsModal}
                    title="View recently discovered markets"
                >
                    New Markets
                </button>
                <button 
                    className={c(styles.tabButton, {[styles.active]: activeTab === 'liquidity'})}
                    onClick={() => setActiveTab('liquidity')}
                    title="Find liquidity opportunities"
                >
                    Liquidity
                </button>
                 <button 
                    className={c(styles.tabButton, {[styles.active]: activeTab === 'arbitrage'})}
                    onClick={() => setActiveTab('arbitrage')}
                    title="Find arbitrage opportunities (Coming Soon)"
                >
                    Arbitrage
                </button>
            </div>
            <div className={styles.tabContent}>
                {renderTabContent()}
            </div>
        </div>
      </div>
    </div>
  );
}
