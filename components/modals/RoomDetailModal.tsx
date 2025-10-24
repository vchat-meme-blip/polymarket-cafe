/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useMemo, useState, useEffect } from 'react';
import Modal from '../Modal';
import { useAgent, useUI, useUser } from '../../lib/state/index.js';
import { useArenaStore } from '../../lib/state/arena';
import { apiService } from '../../lib/services/api.service.js';
import c from 'classnames';
import { Agent } from '../../lib/types/index.js';
import styles from './Modals.module.css';

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
  const { showRoomDetailModal, setShowRoomDetailModal, addToast } = useUI();
  const { rooms } = useArenaStore();
  const [activeTab, setActiveTab] = useState<Tab>('vibe');
  const { current: userAgent } = useAgent();
  const { handle: userHandle } = useUser();
  const allAgents = [
    ...useAgent.getState().availablePresets,
    ...useAgent.getState().availablePersonal,
  ];

  const room = useMemo(() => {
    return rooms.find(r => r.id === showRoomDetailModal);
  }, [rooms, showRoomDetailModal]);

  const [editableRules, setEditableRules] = useState('');
  useEffect(() => {
    if (room) {
      setEditableRules(room.rules.join('\n'));
    }
  }, [room]);


  const isUserOwner = room?.ownerHandle === userHandle;

  const onClose = () => {
    setShowRoomDetailModal(null);
  };

  const handleSaveRules = async () => {
      if (!room) return;
      const rulesArray = editableRules.split('\n').filter(r => r.trim() !== '');
      try {
        await apiService.updateRoom(room.id, { rules: rulesArray });
        addToast({ type: 'system', message: 'Rules updated!' });
      } catch (error) {
        addToast({ type: 'error', message: 'Failed to update rules.' });
      }
  };

  const handleSetVibe = async (vibe: string) => {
    if (!room) return;
    try {
        await apiService.updateRoom(room.id, { vibe });
        addToast({ type: 'system', message: `Vibe set to ${vibe}`});
    } catch (error) {
        addToast({ type: 'error', message: 'Failed to set vibe.' });
    }
  };

  const handleKick = async (agentId: string, ban: boolean = false) => {
    if (!room) return;
    try {
        await apiService.request('/api/arena/kick', {
            method: 'POST',
            body: JSON.stringify({ agentId, roomId: room.id, ban }),
        });
        addToast({ type: 'system', message: `Agent has been ${ban ? 'banned' : 'kicked'}.` });
    } catch (error) {
        addToast({ type: 'error', message: 'Failed to kick agent.' });
    }
  };

  if (!room) return null;

  const roomMembers = room.agentIds.map(id => getAgentById(id, allAgents)).filter((a): a is Agent => !!a);

  return (
    <Modal onClose={onClose}>
      <div className={c(styles.profileView, styles.roomDetailModal)}>
        <div className={styles.modalHeader}>
           <h2>Room Details: {room.name || room.id}</h2>
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
                {isUserOwner ? (
                    <>
                        <p>Set the vibe to guide the conversation.</p>
                        <div className={styles.vibeOptions}>
                            {VIBES.map(vibe => (
                                <button key={vibe} className={c(styles.vibeButton, {[styles.active]: room.vibe === vibe})} onClick={() => handleSetVibe(vibe)}>
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
                        {isUserOwner && member.id !== userAgent.id && (
                            <div style={{display: 'flex', gap: '8px'}}>
                                <button className={c("button", styles.kickButton)} onClick={() => handleKick(member.id, false)}>
                                    <span className="icon">person_remove</span> Kick
                                </button>
                                 <button className={c("button", styles.kickButton)} onClick={() => handleKick(member.id, true)} title="Permanently ban this agent from your room">
                                    <span className="icon">block</span> Ban
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
          )}
          {activeTab === 'rules' && (
            <div className={styles.rulesEditor}>
                {isUserOwner ? (
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
                        {room.rules.length > 0 ? room.rules.map((rule, i) => <li key={i}>{rule}</li>) : <p>No rules set for this room.</p>}
                    </ul>
                )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}