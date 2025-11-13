
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { useUI, useAgent, useUser } from '../../lib/state/index.js';
import { apiService } from '../../lib/services/api.service.js';
import { MarketIntel } from '../../lib/types/index.js';
import styles from './Modals.module.css';
import c from 'classnames';

export default function MarketDetailModal({ market }: { market: MarketIntel }) {
    const { closeMarketDetailModal } = useUI();
    const { current: agent } = useAgent();
    const { bookmarkedMarketIds, toggleBookmark } = useUser();
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [comments, setComments] = useState<any[]>([]);
    const [isLoadingComments, setIsLoadingComments] = useState(true);
    
    const isBookmarked = bookmarkedMarketIds?.includes(market.id);

    useEffect(() => {
        const fetchCommentsAndAnalysis = async () => {
            setIsLoading(true);
            setIsLoadingComments(true);
            
            let fetchedComments: any[] = [];
            
            if (market.platform === 'Polymarket') {
                const marketNumericId = market.id.replace('polymarket-', '');
                
                try {
                    const marketComments = await apiService.request<any[]>(`/api/markets/${marketNumericId}/comments`);
                    if (marketComments && marketComments.length > 0) {
                        fetchedComments = marketComments;
                    } else if (market.eventId) {
                        const eventComments = await apiService.request<any[]>(`/api/markets/comments/${market.eventId}`);
                        fetchedComments = eventComments || [];
                    }
                } catch (error) {
                    console.error("Failed to fetch comments, trying event fallback.", error);
                    if (market.eventId) {
                        try {
                            const eventComments = await apiService.request<any[]>(`/api/markets/comments/${market.eventId}`);
                            fetchedComments = eventComments || [];
                        } catch (eventError) {
                             console.error("Failed to fetch fallback event comments.", eventError);
                        }
                    }
                }
            }
            
            setComments(fetchedComments);
            setIsLoadingComments(false);

            try {
                const response = await apiService.request<{ analysis: string }>('/api/ai/analyze-market', {
                    method: 'POST',
                    body: JSON.stringify({ agentId: agent.id, market, comments: fetchedComments }),
                });
                setAnalysis(response.analysis);
            } catch (error) {
                console.error("Failed to fetch market analysis", error);
                setAnalysis("Sorry, I couldn't analyze this market right now.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchCommentsAndAnalysis();
    }, [agent.id, market]);

    const eventUrl = (market.platform === 'Polymarket' && market.eventSlug)
        ? `https://polymarket.com/event/${market.eventSlug}`
        : null;

    return (
        <Modal onClose={closeMarketDetailModal}>
            <div className={`${styles.modalContentPane} ${styles.intelDossierModal}`}>
                 <div className={styles.dossierHeader}>
                    {market.imageUrl && <img src={market.imageUrl} alt={market.title} className={styles.dossierTokenIcon} />}
                    <div className={styles.dossierTitleGroup}>
                        <h2>{market.title}</h2>
                        <p>{market.platform} / {market.category}</p>
                    </div>
                 </div>
                 <div className={styles.dossierGrid} style={{gridTemplateColumns: '2fr 1fr'}}>
                    <div>
                        <div className={styles.dossierCard}>
                            <h4 className={styles.dossierCardTitle}><span className="icon">description</span>Description</h4>
                            <p>{market.description || "No description available."}</p>
                        </div>
                         <div className={styles.dossierCard} style={{marginTop: '24px'}}>
                            <h4 className={styles.dossierCardTitle}><span className="icon">psychology</span>Agent Analysis</h4>
                            {isLoading ? <p>Thinking...</p> : <p>{analysis}</p>}
                        </div>
                        <div className={styles.dossierCard} style={{marginTop: '24px'}}>
                            <h4 className={styles.dossierCardTitle}><span className="icon">forum</span>Public Sentiment</h4>
                            <div className={styles.tweetStream}>
                                {isLoadingComments ? <p>Loading comments...</p> : comments.length > 0 ? (
                                    comments.map(comment => (
                                        <div key={comment.id} className={styles.tweetCard}>
                                            <div className={styles.tweetHeader}>
                                                <strong className={styles.tweetAuthor}>{comment.profile.pseudonym}</strong>
                                            </div>
                                            <p className={styles.tweetText}>{comment.body}</p>
                                        </div>
                                    ))
                                ) : <p>No comments found for this market.</p>}
                            </div>
                        </div>
                    </div>
                     <div>
                        <div className={styles.dossierCard}>
                            <h4 className={styles.dossierCardTitle}><span className="icon">monitoring</span>Market Stats</h4>
                            <div className={styles.securityMetrics}>
                                {market.outcomes.map(outcome => (
                                    <div className={styles.metricItem} key={outcome.name}>
                                        <span className={styles.metricItemLabel}>{outcome.name}</span>
                                        <span className={styles.metricItemValue}>{Math.round(outcome.price * 100)}¢</span>
                                    </div>
                                ))}
                                <div className={styles.metricItem}>
                                    <span className={styles.metricItemLabel}>Volume</span>
                                    <span className={styles.metricItemValue}>${market.volume.toLocaleString()}</span>
                                </div>
                                <div className={styles.metricItem}>
                                    <span className={styles.metricItemLabel}>Liquidity</span>
                                    <span className={styles.metricItemValue}>${market.liquidity.toLocaleString()}</span>
                                </div>
                                 <div className={styles.metricItem}>
                                    <span className={styles.metricItemLabel}>Ends</span>
                                    <span className={styles.metricItemValue}>{new Date(market.endsAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
                            <a href={market.marketUrl} target="_blank" rel="noopener noreferrer" className="button primary" style={{width: '100%', justifyContent: 'center' }}>
                                View on {market.platform}
                            </a>
                             <button className={c("button secondary", {[styles.bookmarked]: isBookmarked})} style={{width: '100%', justifyContent: 'center'}} onClick={() => toggleBookmark(market.id, !isBookmarked)}>
                                <span className="icon">{isBookmarked ? 'bookmark' : 'bookmark_border'}</span>
                                {isBookmarked ? 'Bookmarked' : 'Bookmark Market'}
                            </button>
                            {eventUrl && (
                                <a href={eventUrl} target="_blank" rel="noopener noreferrer" className="button secondary" style={{width: '100%', justifyContent: 'center' }}>
                                    View Event Page
                                </a>
                            )}
                        </div>
                     </div>
                 </div>
            </div>
        </Modal>
    );
}
