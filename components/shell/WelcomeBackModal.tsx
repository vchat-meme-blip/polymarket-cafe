/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useMemo, useEffect } from 'react';
import { formatDistanceStrict } from 'date-fns';
import Modal from '../Modal';
// FIX: Fix imports for `useAgent` and `useUI` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useAgent, useUI } from '../../lib/state/index.js';
import { simulateOfflineActivity } from '../../lib/state/autonomy';
// FIX: The 'Intel' type is not exported from the autonomy store. It is now imported from its correct source file 'lib/types/index.js'.
import { BettingIntel } from '../../lib/types/index.js';
import styles from '../modals/Modals.module.css';

type WelcomeBackModalProps = {
  timeAwayMs: number;
  onClose: () => void;
};

export default function WelcomeBackModal({
  timeAwayMs,
  onClose,
}: WelcomeBackModalProps) {
  const { current: agent } = useAgent();

  const summary = useMemo(() => {
    return simulateOfflineActivity(timeAwayMs);
  }, [timeAwayMs]);

  useEffect(() => {
    if (!summary) {
      onClose();
    }
  }, [summary, onClose]);


  if (!summary) {
    return null;
  }

  const handleIntelClick = (intel: Partial<BettingIntel>) => {
    onClose();
    // No dossier to open for betting intel yet
  };

  return (
    <Modal onClose={onClose}>
      <div className={`${styles.modalContentPane} ${styles.welcomeBackModal}`}>
        <h2>Welcome Back!</h2>
        <p>
          While you were away for about{' '}
          {formatDistanceStrict(new Date(Date.now() - timeAwayMs), new Date())}, {agent.name} has
          been busy...
        </p>
        <div className={styles.welcomeBackSummary}>
          <div className={styles.summaryItem}>
            <span className="icon" style={{color: 'var(--brand-cyan)'}}>redeem</span>
            <span>
              <strong>
                {/* FIX: Use `boxChange` which is now returned from the simulation. */}
                {summary.boxChange > 0
                  ? `+${summary.boxChange.toLocaleString()}`
                  : summary.boxChange}{' '}
                BOX
              </strong>{' '}
              from trades
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className="icon" style={{color: 'var(--brand-yellow)'}}>military_tech</span>
            <span>
              <strong>
                {summary.repChange > 0
                  ? `+${summary.repChange}`
                  : summary.repChange}{' '}
                Reputation
              </strong>{' '}
              from interactions
            </span>
          </div>
          {summary.intelFound.length > 0 && (
            <div className={styles.summaryItem}>
              <span className="icon" style={{color: 'var(--brand-purple)'}}>database</span>
              <span>
                <strong>{summary.intelFound.length} new pieces of intel</strong>{' '}
                were gathered:
              </span>
            </div>
          )}
          {summary.intelFound.map((intel, i) => (
             <div className={styles.summaryItem} key={i} style={{paddingLeft: '32px'}}>
                <button className={styles.intelButton} onClick={() => handleIntelClick(intel)}>
                    <strong>{intel.market}</strong> - {intel.content?.slice(0, 50) || 'New Alpha'}...
                </button>
             </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="button primary"
          style={{ marginTop: '20px', justifyContent: 'center', width: '100%' }}
        >
          View Dashboard
        </button>
      </div>
    </Modal>
  );
}
