/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAutonomyStore } from '../../lib/state/autonomy';
import { useUI } from '../../lib/state/index.js';
import { BettingIntel } from '../../lib/types/index.js';
import styles from './Dashboard.module.css';
// FIX: Changed to named import from date-fns to resolve module resolution error.
import { formatDistanceToNow } from 'date-fns';

const IntelItem = ({ intel }: { intel: BettingIntel }) => {
    const { setChatPrompt } = useUI();
    const pnl = intel.pnlGenerated?.amount || 0;
    const pnlClass = pnl > 0 ? styles.positive : pnl < 0 ? styles.negative : '';
    
    const handleClick = () => {
        setChatPrompt(`Tell me more about this intel regarding "${intel.market}".`);
    };

    return (
        <div className={`${styles.intelBankItem} ${styles.clickable}`} onClick={handleClick}>
            <div className={styles.intelBankItemHeader}>
                <div className={styles.intelBankItemToken}>
                    {intel.market}
                    {intel.bountyId && <span className={`icon ${styles.bountyRewardIcon}`} title="From Bounty">military_tech</span>}
                </div>
                <span className={styles.intelBankItemTime}>
                    {/* FIX: Wrap timestamp in new Date() as required by date-fns function. */}
                    {formatDistanceToNow(new Date(intel.createdAt), { addSuffix: true })}
                </span>
            </div>
            <p className={styles.intelBankItemSummary}>
                {intel.content || <span className={styles.pending}>Analysis pending...</span>}
            </p>
            <div className={styles.intelItemMetrics}>
                <div className={`${styles.intelMetric} ${pnlClass}`}>
                    <span className="icon">paid</span>
                    <span>${pnl.toFixed(2)} PNL</span>
                </div>
                <div className={styles.intelMetric}>
                    <span className="icon">source</span>
                    <span>{intel.sourceDescription}</span>
                </div>
            </div>
        </div>
    );
};

export default function IntelBankPanel() {
    const { intelBank } = useAutonomyStore();

    return (
        <div className={styles.intelList}>
            {intelBank.length > 0 ? (
                intelBank.map(intel => (
                    <IntelItem key={intel.id} intel={intel} />
                ))
            ) : (
                <p className={styles.empty}>No intel gathered yet. Your agent will add findings here.</p>
            )}
        </div>
    );
}