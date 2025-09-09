import { useMemo, useEffect, useState } from 'react';
import { useArenaStore, TradeRecord } from '../../lib/state/arena';
import { useAgent, useUI } from '../../lib/state';
import { format } from 'date-fns';
import styles from './TradingFloor.module.css';

const AGENT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', 
  '#9b59b6', '#e67e22', '#1abc9c', '#e84393'
];

export default function TradingFloorView() {
    const { rooms, tradeHistory, lastSyncTimestamp } = useArenaStore();
    const { availablePersonal, availablePresets } = useAgent();
    const { setView, setInitialArenaFocus } = useUI();
    const allAgents = useMemo(() => [...availablePersonal, ...availablePresets], [availablePersonal, availablePresets]);
    
    // Force component to update when rooms change
    const [updateTrigger, setUpdateTrigger] = useState(Date.now());
    
    // Update trigger when lastSyncTimestamp changes
    useEffect(() => {
        setUpdateTrigger(Date.now());
        console.log('[TradingFloor] Detected world state update, refreshing offers');
    }, [lastSyncTimestamp]);

    const activeOffers = useMemo(() => {
        console.log('[TradingFloor] Recalculating active offers, found:', rooms.filter(room => room.activeOffer).length);
        return rooms
            .filter(room => room.activeOffer)
            .map(room => {
                const seller = allAgents.find(a => a.id === room.activeOffer!.fromAgentId);
                return {
                    room,
                    offer: room.activeOffer!,
                    seller,
                };
            });
    }, [rooms, allAgents, updateTrigger]); // Include updateTrigger to force recalculation
    
    const handleGoToRoom = (roomId: string) => {
        setInitialArenaFocus(roomId);
        setView('arena');
    };

    // Process trade history to get agent names
    const processedTradeHistory = useMemo(() => {
        console.log('[TradingFloor] Recalculating trade history, found:', tradeHistory.length);
        return tradeHistory.map(trade => {
            const seller = allAgents.find(a => a.id === trade.fromId);
            const buyer = allAgents.find(a => a.id === trade.toId);
            return {
                ...trade,
                sellerName: seller?.name || 'Unknown Agent',
                buyerName: buyer?.name || 'Unknown Agent',
                sellerColor: seller ? AGENT_COLORS[seller.name.charCodeAt(0) % AGENT_COLORS.length] : '#888',
                buyerColor: buyer ? AGENT_COLORS[buyer.name.charCodeAt(0) % AGENT_COLORS.length] : '#888',
            };
        }).sort((a, b) => b.timestamp - a.timestamp); // Sort by most recent first
    }, [tradeHistory, allAgents, updateTrigger]); // Include updateTrigger to force recalculation

    return (
        <div className={styles.tradingFloorView}>
            <h2>Trading Floor</h2>
            
            {/* Active Offers Section */}
            <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                    <span className="icon">storefront</span>
                    Active Offers
                </h3>
                <button 
                    className={styles.refreshButton} 
                    onClick={() => setUpdateTrigger(Date.now())}
                    aria-label="Refresh offers"
                >
                    <span className="icon">refresh</span>
                </button>
            </div>
            {activeOffers.length === 0 ? (
                <div className={styles.emptyState}>
                    <span className="icon">storefront</span>
                    <p>No active offers in the Café right now. The market is quiet.</p>
                </div>
            ) : (
                <div className={styles.offerGrid}>
                    {activeOffers.map(({ room, offer, seller }) => {
                       const color = seller ? AGENT_COLORS[seller.name.charCodeAt(0) % AGENT_COLORS.length] : '#888';
                       return (
                            <div key={`${room.id}-${offer.token}`} className={styles.offerCard}>
                                <div className={styles.offerHeader}>
                                    <span className={styles.offerToken}>${offer.token}</span>
                                    <span className={styles.offerPrice}>
                                        <span className="icon">redeem</span>
                                        {offer.price.toLocaleString()} BOX
                                    </span>
                                </div>
                                {seller && (
                                    <div className={styles.offerSellerInfo}>
                                        <div className={styles.sellerAvatar} style={{ backgroundColor: color }}>
                                            {seller.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p>Offered by <strong>{seller.name}</strong></p>
                                            <p>In Room {room.id.split('-')[1]}</p>
                                        </div>
                                    </div>
                                )}
                                <div className={styles.offerCardFooter}>
                                    <button className="button primary" onClick={() => handleGoToRoom(room.id)}>
                                        <span className="icon">login</span>
                                        Go to Room
                                    </button>
                                </div>
                            </div>
                       )
                    })}
                </div>
            )}
            
            {/* Trade History Section */}
            <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                    <span className="icon">history</span>
                    Recent Trades
                </h3>
                <button 
                    className={styles.refreshButton} 
                    onClick={() => setUpdateTrigger(Date.now())}
                    aria-label="Refresh trades"
                >
                    <span className="icon">refresh</span>
                </button>
            </div>
            {processedTradeHistory.length === 0 ? (
                <div className={styles.emptyState}>
                    <span className="icon">history</span>
                    <p>No trades have been completed yet. Check back later!</p>
                </div>
            ) : (
                <div className={styles.tradeHistoryContainer}>
                    <table className={styles.tradeHistoryTable}>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Token</th>
                                <th>Price</th>
                                <th>Seller</th>
                                <th>Buyer</th>
                                <th>Room</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedTradeHistory.map((trade, index) => (
                                <tr key={`trade-${index}-${trade.timestamp}`}>
                                    <td>{format(trade.timestamp, 'MMM d, h:mm a')}</td>
                                    <td className={styles.tokenCell}>${trade.token}</td>
                                    <td className={styles.priceCell}>{trade.price.toLocaleString()} BOX</td>
                                    <td>
                                        <div className={styles.agentCell}>
                                            <div className={styles.agentAvatar} style={{ backgroundColor: trade.sellerColor }}>
                                                {trade.sellerName.charAt(0)}
                                            </div>
                                            <span>{trade.sellerName}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className={styles.agentCell}>
                                            <div className={styles.agentAvatar} style={{ backgroundColor: trade.buyerColor }}>
                                                {trade.buyerName.charAt(0)}
                                            </div>
                                            <span>{trade.buyerName}</span>
                                        </div>
                                    </td>
                                    <td>Room {trade.roomId.split('-')[1]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}