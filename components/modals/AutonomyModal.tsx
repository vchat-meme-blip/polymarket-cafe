/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import Modal from '../../components/Modal';
import { useUI, useUser } from '../../lib/state/index.js';
import { useAutonomyStore } from '../../lib/state/autonomy.js';
import styles from './AutonomyModal.module.css';
import c from 'classnames';
import { NotificationSettings } from '../../lib/types/index.js';

const ToggleControl = ({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: () => void; title?: string; }) => (
  <div className={styles.toggleControl} title={title}>
    <label htmlFor={`toggle-${label}`}>{label}</label>
    <div className={styles.toggleSwitch}>
      <input type="checkbox" id={`toggle-${label}`} checked={checked} onChange={onChange} />
      <label htmlFor={`toggle-${label}`}></label>
    </div>
  </div>
);

export default function AutonomyModal() {
  const { closeAutonomyModal, setChatPrompt } = useUI();
  const { isAutonomyEnabled, toggleAutonomy } = useAutonomyStore();
  const { notificationSettings, updateNotificationSettings } = useUser();

  const handleToggle = async (key: keyof NotificationSettings) => {
    // notificationSettings is guaranteed to be defined by the type fix
    await updateNotificationSettings({
      notificationSettings: { ...notificationSettings, [key]: !notificationSettings[key] },
    });
  };

  const handleViewCapabilities = () => {
    setChatPrompt("What can you do on your own?");
    closeAutonomyModal();
  };

  return (
    <Modal onClose={closeAutonomyModal}>
      <div className={c(styles.modalContentPane, styles.autonomyModal)}>
        <h2>Agent Autonomy</h2>
        <p>Configure how your active agent behaves when you're not around.</p>
        
        <div className={styles.autonomyControls}>
            <ToggleControl 
                label="Enable Autonomy"
                checked={isAutonomyEnabled}
                onChange={toggleAutonomy}
                title="When enabled, your active agent will perform actions in the background."
            />
        </div>

        <h4>Fallback Decision Tree</h4>
        <p>When your agent has no tasks, it will choose one of these actions during its autonomy cycle.</p>
        <div className={styles.decisionTree}>
          <div className={styles.treeNode}>
            <h4><span className={styles.percentage}>70%</span> Go to the Café</h4>
            <p>Enter the Intel Exchange to find conversations and trade intel.</p>
            <ToggleControl
              label="Notify on Action"
              checked={notificationSettings.autonomyCafe}
              onChange={() => handleToggle('autonomyCafe')}
            />
          </div>
          <div className={styles.treeNode}>
            <h4><span className={styles.percentage}>20%</span> Proactive Engagement</h4>
            <p>Review findings and send you a suggestion on your dashboard.</p>
             <ToggleControl
              label="Notify on Action"
              checked={notificationSettings.autonomyEngage}
              onChange={() => handleToggle('autonomyEngage')}
            />
          </div>
          <div className={styles.treeNode}>
            <h4><span className={styles.percentage}>10%</span> Deep Research</h4>
            <p>Perform a web search on a trending market to discover new alpha.</p>
             <ToggleControl
              label="Notify on Action"
              checked={notificationSettings.autonomyResearch}
              onChange={() => handleToggle('autonomyResearch')}
            />
          </div>
        </div>
        
        <button onClick={handleViewCapabilities} className="button" style={{ marginTop: '24px' }}>
          <span className="icon">psychology_alt</span> Ask Agent About Capabilities
        </button>

      </div>
    </Modal>
  );
}