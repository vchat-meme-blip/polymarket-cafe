/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI, useUser } from '../../lib/state';
import ArenaView from '../arena/ArenaView';
import Dashboard from '../dashboard/Dashboard';
import Sidebar from './Sidebar';
import ListenInModal from '../arena/ListenInModal';
import MailView from '../mail/MailView';
import BountyBoardView from '../bounty/BountyBoardView';
import { useEffect, useState } from 'react';
import { useWalletStore } from '../../lib/state/wallet';
import WelcomeBackModal from './WelcomeBackModal';
import AgentsView from '../agents/AgentsView';
import RoomDetailModal from '../arena/RoomDetailModal';
import AgentDossierModal from '../modals/AgentDossierModal';
import HelpModal from '../modals/HelpModal';
import styles from './Shell.module.css';

/**
 * The main application shell for authenticated users.
 */
export default function AppShell() {
  const { view, listeningOnRoomId, showRoomDetailModal, agentDossierId, showHelpModal } = useUI();
  const { claimDailyStipend } = useWalletStore();
  const { lastSeen, setLastSeen } = useUser();
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);

  useEffect(() => {
    claimDailyStipend();
    const now = Date.now();
    const currentLastSeen = useUser.getState().lastSeen;
    const timeAway = now - (currentLastSeen || now);
    if (currentLastSeen && timeAway > 1000 * 60 * 5) {
      setShowWelcomeBack(true);
    }
    const interval = setInterval(() => {
      setLastSeen(Date.now());
    }, 30000);
    return () => {
      clearInterval(interval);
      setLastSeen(Date.now());
    };
  }, [claimDailyStipend, setLastSeen]);

  return (
    <div className={styles.appShell}>
      <Sidebar />
      <div className={styles.appContent}>
        {view === 'dashboard' && <Dashboard />}
        {view === 'arena' && <ArenaView />}
        {view === 'mail' && <MailView />}
        {view === 'bounty' && <BountyBoardView />}
        {view === 'agents' && <AgentsView />}
      </div>
      {listeningOnRoomId && <ListenInModal />}
      {showRoomDetailModal && <RoomDetailModal />}
      {agentDossierId && <AgentDossierModal agentId={agentDossierId} />}
      {showHelpModal && <HelpModal />}
      {showWelcomeBack && (
        <WelcomeBackModal
          timeAwayMs={Date.now() - (lastSeen || Date.now())}
          onClose={() => setShowWelcomeBack(false)}
        />
      )}
    </div>
  );
}
