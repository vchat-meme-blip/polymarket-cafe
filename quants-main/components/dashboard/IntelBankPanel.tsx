/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAutonomyStore } from '../../lib/state/autonomy';
// FIX: The 'Intel' type is not exported from the autonomy store. It is now imported from its correct source file 'lib/types/index.js'.
import { Intel } from '../../lib/types/index.js';
import { formatDistanceToNow } from 'date-fns';
import { useUI } from '../../lib/state';
import c from 'classnames';
// FIX: Added missing `React` import to resolve namespace errors.
import React from 'react';
import { useState } from 'react';
import { apiService } from '../../lib/services/api.service';
import styles from './Dashboard.module.css';

export default function IntelBankPanel() {
  const { intelBank, addIntelFromConversation, updateIntel } = useAutonomyStore();
  const { openIntelDossier, addToast } = useUI();
  const [scoutInput, setScoutInput] = useState('');
  const [isScouting, setIsScouting] = useState(false);

  const handleScoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = scoutInput.trim();
    if (!query || isScouting) return;

    setIsScouting(true);
    try {
      // The client now calls a single, secure endpoint.
      // The server handles Solscan calls and AI synthesis.
      const newIntel = await apiService.scoutToken(query);

      // The analysis result now contains the correct ID
      const existingIntel = intelBank.find(i => i.id === newIntel.id);
      if (existingIntel) {
        updateIntel(existingIntel.id, newIntel);
      } else {
        addIntelFromConversation(newIntel);
      }

      const finalIntel =
        useAutonomyStore
          .getState()
          .intelBank.find(i => i.id === newIntel.id) || (newIntel as Intel);

      // Show the success toast
      // FIX: Add missing 'type' property to the addToast call.
      addToast({
        message: 'Scouting Complete',
        tokenName: finalIntel.token,
        intel: finalIntel,
        type: 'intel',
      });

      setScoutInput('');
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : `Could not find or analyze "${query}".`;
      console.error('On-demand scout failed:', error);
      alert(errorMessage);
    } finally {
      setIsScouting(false);
    }
  };

  return (
    <div className={`${styles.dashboardPanel} ${styles.intelBankPanel}`}>
      <h3 className={styles.dashboardPanelTitle}>
        <span className="icon">database</span>
        Intel Bank
      </h3>
      <div className={styles.intelBankList}>
        {intelBank.length === 0 ? (
          <p className={styles.empty}>
            Agent is scouting for alpha... Give it a moment!
          </p>
        ) : (
          intelBank.map(intel => {
            const sentiment = intel.socialSentiment?.overallSentiment;
            const holderRisk =
              (intel.securityAnalysis?.holderConcentration.top10Percent ?? 0) >
              20
                ? 'High'
                : (intel.securityAnalysis?.holderConcentration.top10Percent ??
                      0) > 10
                  ? 'Medium'
                  : 'Low';

            return (
              <div
                key={intel.id}
                className={`${styles.intelBankItem} ${styles.clickable}`}
                onClick={() => openIntelDossier(intel)}
              >
                <div className={styles.intelBankItemHeader}>
                  <span className={styles.intelBankItemToken}>
                    {intel.token}
                    {intel.bountyId && (
                      <span
                        className={`icon ${styles.bountyRewardIcon}`}
                        title="Acquired via bounty"
                      >
                        🏆
                      </span>
                    )}
                  </span>
                  <span className={styles.intelBankItemTime}>
                    {formatDistanceToNow(intel.timestamp, { addSuffix: true })}
                  </span>
                </div>
                <p
                  className={`${styles.intelBankItemSummary} ${
                    intel.summary ? '' : styles.pending
                  }`}
                >
                  {intel.summary || `Research pending...`}
                </p>
                <div className={styles.intelItemMetrics}>
                  {intel.securityAnalysis && (
                    <div
                      className={c(styles.intelMetric, {
                        [styles.riskHigh]: holderRisk === 'High',
                        [styles.riskMedium]: holderRisk === 'Medium',
                        [styles.riskLow]: holderRisk === 'Low',
                      })}
                      title={`Top 10 holders own ${intel.securityAnalysis.holderConcentration.top10Percent}% of supply`}
                    >
                      <span className="icon">security</span>
                      <span>{holderRisk} Risk</span>
                    </div>
                  )}
                  {sentiment && (
                    <div
                      className={c(styles.intelMetric, {
                        [styles.sentimentBullish]: sentiment === 'Bullish',
                        [styles.sentimentBearish]: sentiment === 'Bearish',
                        [styles.sentimentNeutral]: sentiment === 'Neutral',
                      })}
                      title={`Social sentiment is ${sentiment}`}
                    >
                      <span className="icon">podcasts</span>
                      <span>{sentiment}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <form className={styles.intelScoutForm} onSubmit={handleScoutSubmit}>
        <input
          type="text"
          value={scoutInput}
          onChange={e => setScoutInput(e.target.value)}
          placeholder="Scout by symbol or address..."
          disabled={isScouting}
        />
        <button
          type="submit"
          className="button primary"
          disabled={!scoutInput.trim() || isScouting}
        >
          <span className="icon">travel_explore</span>
          {isScouting ? 'Scouting...' : 'Scout'}
        </button>
      </form>
    </div>
  );
}