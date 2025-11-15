/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback } from 'react';
import { useUser, useUI } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import styles from './Profile.module.css';
import { CreditUsageLog } from '../../lib/types/index.js';
import { formatDistanceToNow } from 'date-fns';

const creditPackages = [
    { credits: 5000, price: 5, icon: 'local_mall' },
    { credits: 11000, price: 10, icon: 'shopping_bag' },
    { credits: 30000, price: 25, icon: 'shopping_cart' },
];

const LOW_CREDIT_THRESHOLD = 500;

export default function BillingTab() {
    const { credits } = useUser();
    const { addToast } = useUI();
    const { publicKey } = useWallet();
    
    const [history, setHistory] = useState<CreditUsageLog[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const fetchHistory = useCallback(async (pageNum: number) => {
        setIsLoadingHistory(true);
        try {
            const response = await apiService.get<{ logs: CreditUsageLog[], hasMore: boolean }>(`/api/credits/history?page=${pageNum}`);
            setHistory(prev => pageNum === 1 ? response.logs : [...prev, ...response.logs]);
            setHasMore(response.hasMore);
        } catch (error) {
            addToast({ type: 'error', message: 'Failed to load credit history.' });
        } finally {
            setIsLoadingHistory(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchHistory(1);
    }, [fetchHistory]);

    const handlePurchase = async (price: number, creditsToPurchase: number) => {
        if (!publicKey) {
            addToast({ type: 'error', message: 'Please connect your wallet first.' });
            return;
        }
        
        setIsPurchasing(price);
        try {
            const { newCredits } = await apiService.request<{ newCredits: number }>('/api/credits/purchase', {
                method: 'POST',
                body: JSON.stringify({ amount: price, credits: creditsToPurchase }),
            });

            useUser.setState({ credits: newCredits });
            addToast({ type: 'system', message: `Successfully purchased ${creditsToPurchase.toLocaleString()} credits!` });
            await fetchHistory(1); // Refresh history after purchase
        } catch (error: any) {
            // The 402 error is handled by the api.service, we only need to catch other errors.
            if (!error.message.includes('Payment was canceled')) {
                 console.error('Purchase failed', error);
                 addToast({ type: 'error', message: error.message || 'Purchase failed. Please try again.' });
            }
        } finally {
            setIsPurchasing(null);
        }
    };

    return (
        <div className={styles.billingTabContent}>
            <div className={styles.balanceDisplay}>
                <p className={styles.balanceLabel}>Current Credit Balance</p>
                <h2 className={styles.balanceAmount}>
                    <span className="icon">toll</span>
                    {(credits ?? 0).toLocaleString()}
                </h2>
                {credits < LOW_CREDIT_THRESHOLD && (
                    <div className={styles.lowCreditWarning}>
                        <span className="icon">warning</span>
                        Your credit balance is running low.
                    </div>
                )}
            </div>
            
            <h4>Purchase Credits</h4>
            <p className={styles.stepHint}>Purchase credits to interact with your AI agents. All payments are processed securely on the Solana blockchain using USDC.</p>
            
            {!publicKey ? (
                 <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}>
                     <WalletMultiButton />
                </div>
            ) : (
                <div className={styles.creditPackages}>
                    {creditPackages.map(pkg => (
                        <div key={pkg.price} className={styles.creditPackage}>
                            <span className={`icon ${styles.packageIcon}`}>{pkg.icon}</span>
                            <div className={styles.packageDetails}>
                                <span className={styles.packageCredits}>{pkg.credits.toLocaleString()} Credits</span>
                                <span className={styles.packagePrice}>${pkg.price} USDC</span>
                            </div>
                            <button 
                                className="button primary" 
                                onClick={() => handlePurchase(pkg.price, pkg.credits)}
                                disabled={isPurchasing !== null}
                            >
                                {isPurchasing === pkg.price ? 'Processing...' : 'Purchase'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className={styles.txHistory}>
                <h4 className={styles.txHistoryTitle}>Credit Usage History</h4>
                <div className={styles.transactionList}>
                    {history.map(log => (
                        <div key={log._id} className={styles.txItem}>
                            <div className={styles.txDetails}>
                                <p className={styles.txDescription}>{log.description}</p>
                                <p className={styles.txTime}>
                                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                                </p>
                            </div>
                            <div className={`${styles.txAmount} ${styles.sent}`}>
                                -{log.cost.toLocaleString()}
                            </div>
                        </div>
                    ))}
                    {isLoadingHistory && <p>Loading history...</p>}
                    {!isLoadingHistory && hasMore && (
                        <button className="button" onClick={() => {
                            const newPage = page + 1;
                            setPage(newPage);
                            fetchHistory(newPage);
                        }}>Load More</button>
                    )}
                    {!isLoadingHistory && history.length === 0 && <p className="empty-chat-log">No credit usage yet.</p>}
                </div>
            </div>
        </div>
    );
}