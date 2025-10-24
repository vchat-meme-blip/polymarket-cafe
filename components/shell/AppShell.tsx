

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

/**
 * The main application shell for authenticated users.
 */
export default function AppShell() {
  const { view, listeningOnRoomId, showRoomDetailModal, agentDossierId, showHelpModal, shareModalData, marketDetailModalData } = useUI();

  return (
    <div className={styles.appShell}>
      <Sidebar />
      <div className={styles.appContent}>
        {view === 'dashboard' && <Dashboard />}
        {view === 'agents' && <AgentsView />}
        {view === 'intel-exchange' && <IntelExchangeView />}
        {view === 'prediction-hub' && <PredictionHubView />}
        {view === 'leaderboard' && <LeaderboardView />}
        {view === 'mail' && <MailView />}
        {view === 'bounty' && <BountyBoardView />}
      </div>
      {listeningOnRoomId && <ListenInModal />}
      {showRoomDetailModal && <RoomDetailModal />}
      {agentDossierId && <AgentDossierModal agentId={agentDossierId} />}
      {showHelpModal && <HelpModal />}
      {shareModalData && <ShareModal data={shareModalData} />}
      {marketDetailModalData && <MarketDetailModal market={marketDetailModalData} />}
    </div>
  );
}