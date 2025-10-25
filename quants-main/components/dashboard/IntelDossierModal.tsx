/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Added missing React import to ensure JSX is correctly interpreted.
import React from 'react';
import Modal from '../Modal';
// FIX: The 'Intel' type is not exported from the autonomy store. It is now imported from its correct source file 'lib/types/index.js'.
import { Intel } from '../../lib/types/index.js';
import c from 'classnames';
import { useUI } from '../../lib/state';
import styles from '../modals/Modals.module.css';

type IntelDossierModalProps = {
  onClose: () => void;
};

const Stat = ({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string | number;
  className?: string;
}) => (
  <div className={styles.metricItem}>
    <span className={styles.metricItemLabel}>{label}</span>
    <span className={c(styles.metricItemValue, className)}>{value}</span>
  </div>
);

const TweetCard = ({
  tweet,
}: {
  tweet: { author: string; text: string; sentiment: string };
}) => (
  <div className={styles.tweetCard}>
    <div className={styles.tweetHeader}>
      <strong className={styles.tweetAuthor}>{tweet.author}</strong>
      <span className={c(styles.tweetSentiment, styles[tweet.sentiment])}>
        {tweet.sentiment}
      </span>
    </div>
    <p className={styles.tweetText}>{tweet.text}</p>
  </div>
);

export default function IntelDossierModal({ onClose }: IntelDossierModalProps) {
  const { showIntelDossier: intel } = useUI();

  if (!intel) return null;

  const { marketData, securityAnalysis, socialSentiment, summary } = intel;

  const holderRisk =
    (securityAnalysis?.holderConcentration.top10Percent ?? 0) > 20
      ? 'High'
      : (securityAnalysis?.holderConcentration.top10Percent ?? 0) > 10
        ? 'Medium'
        : 'Low';

  return (
    <Modal onClose={onClose}>
      <div className={`${styles.modalContentPane} ${styles.intelDossierModal}`}>
        <div className={styles.dossierHeader}>
          <div className={styles.dossierTokenIcon}>{intel.token.charAt(0)}</div>
          <div className={styles.dossierTitleGroup}>
            <h2>{marketData.name} (${intel.token})</h2>
            <p title={marketData.mintAddress}>
              {marketData.mintAddress.slice(0, 8)}...
            </p>
          </div>
        </div>

        {summary && (
          <div className={styles.dossierSummary}>
            <strong>AI Vibe Check:</strong> {summary}
          </div>
        )}

        <div className={styles.dossierGrid}>
          <div className={styles.dossierCard}>
            <h4 className={styles.dossierCardTitle}>
              <span className="icon">monitoring</span>Market Data
            </h4>
            <div className={styles.securityMetrics}>
              <Stat
                label="Price"
                value={`$${marketData.priceUsd?.toPrecision(4) ?? 'N/A'}`}
              />
              <Stat
                label="24h Change"
                value={`${marketData.priceChange24h?.toFixed(2) ?? 'N/A'}%`}
                className={
                  (marketData.priceChange24h ?? 0) >= 0
                    ? styles.riskLow
                    : styles.riskHigh
                }
              />
              <Stat
                label="Market Cap"
                value={`$${marketData.marketCap?.toLocaleString() ?? 'N/A'}`}
              />
              <Stat
                label="Liquidity"
                value={`$${marketData.liquidityUsd?.toLocaleString() ?? 'N/A'}`}
              />
            </div>
          </div>
          <div className={styles.dossierCard}>
            <h4 className={styles.dossierCardTitle}>
              <span className="icon">security</span>Security
            </h4>
            {securityAnalysis ? (
              <div className={styles.securityMetrics}>
                <Stat
                  label="Honeypot Risk"
                  value={securityAnalysis.isHoneypot ? 'Yes' : 'No'}
                  className={
                    securityAnalysis.isHoneypot ? styles.riskHigh : styles.riskLow
                  }
                />
                <Stat
                  label="Contract Renounced"
                  value={securityAnalysis.isContractRenounced ? 'Yes' : 'No'}
                  className={
                    securityAnalysis.isContractRenounced ? styles.riskLow : styles.riskHigh
                  }
                />
                <Stat
                  label="Holder Concentration"
                  value={holderRisk}
                  className={c({
                    [styles.riskHigh]: holderRisk === 'High',
                    [styles.riskMedium]: holderRisk === 'Medium',
                    [styles.riskLow]: holderRisk === 'Low',
                  })}
                />
                <Stat
                  label="Top 10 Holders"
                  value={`${securityAnalysis.holderConcentration.top10Percent.toFixed(1)}%`}
                />
              </div>
            ) : (
              <p>No security data available.</p>
            )}
          </div>
        </div>

        <div className={styles.dossierCard} style={{ marginTop: '24px' }}>
          <h4 className={styles.dossierCardTitle}>
            <span className="icon">podcasts</span>Social Sentiment
          </h4>
          {socialSentiment && socialSentiment.tweets.length > 0 ? (
            <div className={styles.tweetStream}>
              {socialSentiment.tweets.map((tweet, i) => (
                <TweetCard key={i} tweet={tweet} />
              ))}
            </div>
          ) : (
            <p>No social sentiment data available.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}