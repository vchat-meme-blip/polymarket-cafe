/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Fix import for `useUI` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useUI } from '../../lib/state/index.js';
import IntelExchangeView from '../arena/ArenaView';
// FIX: Added .js extension to import to fix module resolution error.
import Dashboard from '../dashboard/Dashboard.js';
import Sidebar from './Sidebar';
import ListenInModal from '../arena/ListenInModal';
import MailView from '../mail/MailView';
import BountyBoardView from '../bounty/BountyBoardView';
import AgentsView from '../agents/AgentsView';
import RoomDetailModal from '../arena/RoomDetailModal';
import AgentDossierModal from '../modals/AgentDossierModal';
import HelpModal from '../modals/HelpModal';
import styles from './Shell.module.css';
import PredictionHubView from '../trading-floor/PredictionHubView.js';
import LeaderboardView from '../leaderboard/LeaderboardView';
import ShareModal from '../modals/ShareModal';
import MarketDetailModal from '../modals/MarketDetailModal';
import c from 'classnames';

/**
 * The main application shell for authenticated users.
 */
export default function AppShell() {
  const { view, listeningOnRoomId, showRoomDetailModal, agentDossierId, showHelpModal, shareModalData, marketDetailModalData, isMobileNavOpen, toggleMobileNav } = useUI();

  return (
    <div className={styles.appShell}>
      <Sidebar />
      <div className={c(styles.appContent, { [styles.appContentFull]: !isMobileNavOpen })}>
        {view === 'dashboard' && <Dashboard />}
        {view === 'agents' && <AgentsView />}
        {view === 'prediction-hub' && <PredictionHubView />}
        {view === 'leaderboard' && <LeaderboardView />}
        {view === 'intel-exchange' && <IntelExchangeView />}
        {view === 'bounty' && <BountyBoardView />}
        {view === 'mail' && <MailView />}
      </div>
      {listeningOnRoomId && <ListenInModal />}
      {showRoomDetailModal && <RoomDetailModal />}
      {agentDossierId && <AgentDossierModal agentId={agentDossierId} />}
      {showHelpModal && <HelpModal />}
      {shareModalData && <ShareModal data={shareModalData} />}
      {marketDetailModalData && <MarketDetailModal market={marketDetailModalData} />}
      
      <button
        className={c(styles.mobileNavToggle, { [styles.open]: isMobileNavOpen })}
        onClick={toggleMobileNav}
        aria-label={isMobileNavOpen ? 'Hide navigation' : 'Show navigation'}
      >
        <span className="icon">{isMobileNavOpen ? 'close' : 'menu'}</span>
      </button>
    </div>
  );
}