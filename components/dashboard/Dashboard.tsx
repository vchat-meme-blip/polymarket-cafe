/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import c from 'classnames';
import styles from './Dashboard.module.css';
import KeynoteCompanion from './KeynoteCompanion';
import DirectChatLog from './DirectChatLog';
import AgentActionsPanel from './AgentActionsPanel';
import IntelBankPanel from './IntelBankPanel';
import PortfolioPanel from './PortfolioPanel';
import PredictionSidebar from './PredictionSidebar';
import { useAgent, useUser, useUI } from '../../lib/state/index.js';
import FirstAgentPrompt from '../onboarding/FirstAgentPrompt';
import ManageRoomPanel from './ManageRoomPanel';
import ControlTray from '../console/control-tray/ControlTray.js';
import BetSlipPanel from './BetSlipPanel';
import WatchlistPanel from './WatchlistPanel';
import ArbitragePanel from './ArbitragePanel';
import LiquidityPanel from '../trading-floor/LiquidityPanel.js';
import IntelEconomyPanel from './IntelEconomyPanel.js';
import AgentTasksPanel from './AgentTasksPanel.js';

type DashboardTab = 'betSlip' | 'markets' | 'intel' | 'watchlists' | 'arbitrage' | 'liquidity';

/**
 * The main dashboard view that aggregates various components into a single layout.
 * It shows the main agent interaction view and a sidebar with auxiliary information.
 */
export default function Dashboard() {
  const { availablePersonal } = useAgent();
  const { ownedRoomId } = useUser();
  const { openAutonomyModal } = useUI();
  const [activeTab, setActiveTab] = useState<DashboardTab>('betSlip');

  // If the user has no personal agents created yet, show a prompt to guide them to onboarding.
  if (availablePersonal.length === 0) {
    return <FirstAgentPrompt />;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'markets':
        return <PredictionSidebar />;
      case 'intel':
        return <IntelBankPanel />;
      case 'watchlists':
        return <WatchlistPanel />;
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
        <div className={styles.dashboardPanelRow}>
            <PortfolioPanel />
            <IntelEconomyPanel />
        </div>

        <div className={styles.dashboardPanelRow}>
            {ownedRoomId ? <ManageRoomPanel /> : <AgentActionsPanel />}
            <div className={`${styles.dashboardPanel} ${styles.agentActionsPanel}`}>
                 <h3 className={styles.dashboardPanelTitle}>
                    <span className="icon">smart_toy</span>
                    Autonomy
                </h3>
                <button className="button" onClick={openAutonomyModal}>
                    <span className="icon">settings</span> Autonomy Settings
                </button>
            </div>
        </div>

        <AgentTasksPanel />
        
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
                    className={c(styles.tabButton, {[styles.active]: activeTab === 'intel'})}
                    onClick={() => setActiveTab('intel')}
                    title="Review your agent's gathered intel"
                >
                    Intel
                </button>
                <button 
                    className={c(styles.tabButton, {[styles.active]: activeTab === 'watchlists'})}
                    onClick={() => setActiveTab('watchlists')}
                    title="Manage your market and wallet watchlists"
                >
                    Watchlists
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