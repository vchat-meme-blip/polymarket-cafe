/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useMemo, useState } from 'react';
import Modal from '../Modal';
// FIX: Fix imports for `useAgent` and `useUI` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useAgent, useUI } from '../../lib/state/index.js';
import { useArenaStore } from '../../lib/state/arena';
import c from 'classnames';
import { Agent } from '../../lib/types/index.js';
import styles from '../modals/Modals.module.css';

type Tab = 'vibe' | 'members' | 'rules';

const VIBES = [
    'General Chat ☕️',
    'Alpha Leaks 🧠',
    'Bullish 🐂',
    'Bearish 🐻',
    'Shill Zone 🚀',
];

function getAgentById(id: string, allAgents: Agent[]): Agent | undefined {
  return allAgents.find(agent => agent.id === id);
}

export default function RoomDetailModal() {
  const { showRoomDetailModal, setShowRoomDetailModal } = useUI();
  const { rooms, kickAgentFromRoom, setRoomRules, setRoomVibe } = useArenaStore();
  const [activeTab, setActiveTab] = useState<Tab>('vibe');
  const { current: userAgent } = useAgent();
  const allAgents = [
    ...useAgent.getState().availablePresets,
    ...useAgent.getState().availablePersonal,
  ];

  const room = useMemo(() => {
    return rooms.find(r => r.id === showRoomDetailModal);
  }, [rooms, showRoomDetailModal]);

  const [editableRules, setEditableRules] = useState(room?.rules.join('\n') || '');

  const isUserHost = room?.hostId === userAgent.id;

  const onClose = () => {
    setShowRoomDetailModal(null);
  };

  const handleSaveRules = () => {
      if (!room) return;
      const rulesArray = editableRules.split('\n').filter(r => r.trim() !== '');
      setRoomRules(room.id, rulesArray);
      alert('Rules updated!');
  };

  if (!room) return null;

  const roomMembers = room.agentIds.map(id => getAgentById(id, allAgents)).filter((a): a is Agent => !!a);

  return (
    <Modal onClose={onClose}>
      <div className={c(styles.profileView, styles.roomDetailModal)}>
        <div className={styles.modalHeader}>
           <h2>Room Details: {room.id}</h2>
            <button onClick={onClose} className={styles.modalClose}>
                <span className="icon">close</span>
            </button>
        </div>
        <div className={styles.modalTabs}>
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'vibe' })}
            onClick={() => setActiveTab('vibe')}
          >
            Vibe
          </button>
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'members' })}
            onClick={() => setActiveTab('members')}
          >
            Members ({roomMembers.length})
          </button>
          <button
            className={c(styles.tabButton, { [styles.active]: activeTab === 'rules' })}
            onClick={() => setActiveTab('rules')}
          >
            Rules
          </button>
        </div>
        <div className={`${styles.modalContent} ${styles.modalContentPane}`}>
          {activeTab === 'vibe' && (
             <div className={styles.vibeSelector}>
                {isUserHost ? (
                    <>
                        <p>Set the vibe to guide the conversation.</p>
                        <div className={styles.vibeOptions}>
                            {VIBES.map(vibe => (
                                <button key={vibe} className={c(styles.vibeButton, {[styles.active]: room.vibe === vibe})} onClick={() => setRoomVibe(room.id, vibe)}>
                                    <span className={styles.vibeIcon}>{vibe.split(' ')[1]}</span>
                                    <span>{vibe.split(' ')[0]}</span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <p>The current room vibe is: <strong>{room.vibe}</strong></p>
                )}
             </div>
          )}
          {activeTab === 'members' && (
            <div className={styles.memberList}>
                {roomMembers.map(member => (
                    <div className={styles.memberItem} key={member.id}>
                        <div className={styles.memberInfo}>
                            <span className={styles.agentName}>{member.name}</span>
                            {room.hostId === member.id && <span className={styles.hostBadge}>(Host)</span>}
                        </div>
                        {isUserHost && member.id !== userAgent.id && (
                            <button className={c("button", styles.kickButton)} onClick={() => kickAgentFromRoom(member.id, room.id)}>
                                <span className="icon">person_remove</span> Kick
                            </button>
                        )}
                    </div>
                ))}
            </div>
          )}
          {activeTab === 'rules' && (
            <div className={styles.rulesEditor}>
                {isUserHost ? (
                    <form onSubmit={e => {e.preventDefault(); handleSaveRules();}}>
                        <textarea 
                            rows={6}
                            value={editableRules}
                            onChange={e => setEditableRules(e.target.value)}
                            placeholder="Enter one rule per line."
                        />
                        <button type="submit" className="button primary">Save Rules</button>
                    </form>
                ) : (
                    <ul className={styles.rulesList}>
                        {room.rules.map((rule, i) => <li key={i}>{rule}</li>)}
                    </ul>
                )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}