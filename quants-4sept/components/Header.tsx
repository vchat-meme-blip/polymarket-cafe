/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Moved createNewAgent import from `presets` to `state` to resolve module not found error.
import { Agent } from '../lib/presets/agents';
import { useAgent, useUI, useUser, createNewAgent } from '../lib/state';
import c from 'classnames';
import { useEffect, useState } from 'react';
import styles from './shell/Shell.module.css';

export default function Header() {
  const { openAgentDossier } = useUI();
  const { name } = useUser();
  const {
    current,
    setCurrent,
    availablePresets,
    availablePersonal,
    ensureCurrentAgentIsPersonal,
  } = useAgent();
  const { showProfileView, setShowProfileView } = useUI();

  let [showRoomList, setShowRoomList] = useState(false);

  useEffect(() => {
    const close = () => setShowRoomList(false);
    document.body.addEventListener('click', close);
    return () => document.body.removeEventListener('click', close);
  }, []);

  function changeAgent(agent: Agent | string) {
    setCurrent(typeof agent === 'string' ? agent : agent.id);
  }

  async function handleEditClick() {
    const agentToEditId = await ensureCurrentAgentIsPersonal();
    openAgentDossier(agentToEditId);
  }

  const personalAgentSourceIds = new Set(
    availablePersonal.map(a => a.copiedFromId).filter(Boolean),
  );
  const visiblePresets = availablePresets.filter(
    p => !personalAgentSourceIds.has(p.id),
  );

  const handleAddNew = async () => {
    const newAgentTemplate = createNewAgent();
    openAgentDossier(newAgentTemplate.id, true);
  }

  return (
    <header className={styles.header}>
      <div className={styles.roomInfo}>
        <div className={styles.roomName}>
          <button
            onClick={e => {
              e.stopPropagation();
              setShowRoomList(!showRoomList);
            }}
            className={styles.agentSelector}
          >
            <h1 className={c({ [styles.active]: showRoomList })}>
              {current.name}
              <span className="icon">arrow_drop_down</span>
            </h1>
          </button>

          <button
            onClick={handleEditClick}
            className={c('button', styles.createButton)}
            aria-label="Edit current agent"
          >
            <span className="icon">edit</span> Edit
          </button>
        </div>

        <div className={c(styles.roomList, { [styles.active]: showRoomList })} onClick={e => e.stopPropagation()}>
          <div>
            <h3>Presets</h3>
            <ul>
              {visiblePresets
                .filter(agent => agent.id !== current.id)
                .map(agent => (
                  <li
                    key={agent.name}
                    className={c({ [styles.active]: agent.id === current.id })}
                  >
                    <button onClick={() => changeAgent(agent)}>
                      <span className={styles.agentIcon}>{agent.name.charAt(0)}</span>
                      {agent.name}
                    </button>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <div className={styles.yourChatterbotsHeader}>
              <h3>Your Quants</h3>
              <div className={styles.infoTooltipContainer}>
                <span className={c('icon', styles.infoIcon)}>info</span>
                <div className={styles.infoTooltip}>
                  <p>
                    You control one agent at a time. Editing a preset will
                    create a personal copy for you to customize without changing
                    the original.
                  </p>
                </div>
              </div>
            </div>
            {
              <ul>
                {availablePersonal.length ? (
                  availablePersonal.map(({ id, name }) => (
                    <li key={name} className={c({ [styles.active]: id === current.id })}>
                      <button onClick={() => changeAgent(id)}>
                        {name && <span className={styles.agentIcon}>{name.charAt(0)}</span>}
                        {name}
                      </button>
                    </li>
                  ))
                ) : (
                  <p style={{padding: '8px', fontSize: '14px', color: 'var(--Neutral-60)'}}>None yet.</p>
                )}
              </ul>
            }
            <button
              className={styles.newRoomButton}
              onClick={handleAddNew}
            >
              <span className="icon">add</span>New Quant
            </button>
          </div>
        </div>
      </div>
      <button
        className={styles.userSettingsButton}
        onClick={() => setShowProfileView(!showProfileView)}
        aria-label="User profile and wallet"
      >
        <p className={styles.userName}>{name || 'Your name'}</p>
        <span className="icon">tune</span>
      </button>
    </header>
  );
}
