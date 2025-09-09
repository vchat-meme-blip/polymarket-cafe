/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI } from '../../lib/state';
import { Intel } from '../../lib/state/autonomy';
import c from 'classnames';
import styles from './Dashboard.module.css';

type TokenSummaryCardProps = {
  intel: Intel;
};

const Metric = ({ label, value, className = '' }: { label: string; value: string | number; className?: string }) => (
    <div className={styles.tokenMetric}>
        <span className={styles.tokenMetricLabel}>{label}</span>
        <span className={c(styles.tokenMetricValue, className)}>{value}</span>
    </div>
);


export default function TokenSummaryCard({ intel }: TokenSummaryCardProps) {
    const { openIntelDossier } = useUI();
    const { marketData } = intel;

    if (!marketData) return null;

    const priceChange = marketData.priceChange24h ?? 0;
    const priceChangeClass = priceChange >= 0 ? styles.positive : styles.negative;

  return (
    <div className={styles.tokenSummaryCard}>
        <div className={styles.tokenSummaryHeader}>
            <div className={styles.tokenSummaryIcon}>{intel.token.charAt(0)}</div>
            <h4 className={styles.tokenSummaryName}>${intel.token}</h4>
        </div>
        <div className={styles.tokenSummaryMetrics}>
            <Metric label="Price" value={`$${marketData.priceUsd?.toPrecision(3) ?? 'N/A'}`} />
            <Metric label="24h Change" value={`${priceChange.toFixed(2)}%`} className={priceChangeClass} />
        </div>
        <button className="button primary" style={{justifyContent: 'center', marginTop: '8px'}} onClick={() => openIntelDossier(intel)}>
            <span className="icon">open_in_new</span>
            View Full Dossier
        </button>
    </div>
  );
}