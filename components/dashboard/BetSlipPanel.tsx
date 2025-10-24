/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI, useAgent } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import styles from './Dashboard.module.css';

export default function BetSlipPanel() {
    const { betSlipProposal, setBetSlipProposal } = useUI();
    const { current: currentAgent } = useAgent();

    if (!betSlipProposal) {
        return (
            <div className={styles.emptyBetSlip}>
                <span className="icon">receipt_long</span>
                <p>Your agent's bet suggestions will appear here after you chat with them.</p>
            </div>
        );
    }

    const { suggestion, analysis, market } = betSlipProposal;
    const outcome = suggestion.outcome === 'yes' ? 'Yes' : 'No';
    const price = suggestion.price ? (suggestion.price * 100).toFixed(0) : 'N/A'; // Convert to cents

    const handlePlaceBet = async () => {
        try {
            await apiService.placeBet(currentAgent.id, {
                marketId: suggestion.marketId!,
                outcome: suggestion.outcome!,
                amount: suggestion.amount!,
                price: suggestion.price!,
                sourceIntelId: suggestion.sourceIntelId, // Pass the intel ID
            });
            alert('Bet placed successfully!');
            setBetSlipProposal(null);
        } catch (error) {
            console.error("Failed to place bet", error);
            alert("Failed to place bet. Please try again.");
        }
    };

    return (
        <div className={styles.betSlip}>
            <div className={styles.betSlipMarket}>
                <p className={styles.marketTitle}>{market.title}</p>
            </div>
            <div className={styles.betSlipDetails}>
                <div className={styles.betSlipRow}>
                    <span>Agent:</span>
                    <span>{currentAgent.name}</span>
                </div>
                <div className={styles.betSlipRow}>
                    <span>Outcome:</span>
                    <span className={suggestion.outcome === 'yes' ? styles.positive : styles.negative}>{outcome}</span>
                </div>
                <div className={styles.betSlipRow}>
                    <span>Amount:</span>
                    <span>${suggestion.amount}</span>
                </div>
                <div className={styles.betSlipRow}>
                    <span>Odds:</span>
                    <span>{price}¢</span>
                </div>
            </div>
            <div className={styles.betSlipAnalysis}>
                <h5>Agent's Analysis</h5>
                <p>{analysis}</p>
            </div>
            <div className={styles.betSlipActions}>
                <button className="button" onClick={() => setBetSlipProposal(null)}>Dismiss</button>
                <button className="button primary" onClick={handlePlaceBet}>Place Bet</button>
            </div>
        </div>
    );
}
