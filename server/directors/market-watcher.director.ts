
import { usersCollection, newMarketsCacheCollection } from '../db.js';
import { polymarketService } from '../services/polymarket.service.js';
import { notificationService } from '../services/notification.service.js';
import { MarketIntel } from '../../lib/types/index.js';

type EmitToMainThread = (message: { type: string; event?: string; payload?: any; room?: string }) => void;

export class MarketWatcherDirector {
    private lastSeenMarketId: number = 0;
    private isTicking = false;
    private emitToMain?: EmitToMainThread;

    constructor() {
        console.log('[MarketWatcherDirector] Initialized.');
        this.initializeLastSeenId();
    }
    
    public initialize(emitCallback: EmitToMainThread) {
        this.emitToMain = emitCallback;
    }

    private async initializeLastSeenId() {
        try {
            const { markets } = await polymarketService.getLiveMarkets(1, 'Breaking');
            if (markets.length > 0) {
                const numericId = parseInt(markets[0].id.replace('polymarket-', ''), 10);
                if (!isNaN(numericId)) {
                    this.lastSeenMarketId = numericId;
                    console.log(`[MarketWatcherDirector] Initialized with last seen market ID: ${this.lastSeenMarketId}`);
                }
            }
        } catch (error) {
            console.error('[MarketWatcherDirector] Failed to initialize last seen market ID:', error);
        }
    }

    public async tick() {
        if (this.isTicking) {
            return;
        }
        this.isTicking = true;
        console.log('[MarketWatcherDirector] Checking for new markets...');

        try {
            const { markets: recentMarkets } = await polymarketService.getLiveMarkets(20, 'Breaking');
            
            const newMarkets = recentMarkets
                .map(m => ({
                    ...m,
                    numericId: parseInt(m.id.replace('polymarket-', ''), 10)
                }))
                .filter(m => !isNaN(m.numericId) && m.numericId > this.lastSeenMarketId);

            if (newMarkets.length > 0) {
                this.lastSeenMarketId = Math.max(...newMarkets.map(m => m.numericId));
                console.log(`[MarketWatcherDirector] Found ${newMarkets.length} new market(s). New last seen ID: ${this.lastSeenMarketId}`);

                for (const market of newMarkets) {
                    // 1. Save to persistent cache
                    const cacheEntry = { ...market, detectedAt: Date.now() };
                    await newMarketsCacheCollection.insertOne(cacheEntry as any);

                    // 2. Emit socket event for client-side toast
                    this.emitToMain?.({
                        type: 'socketEmit',
                        event: 'newMarketFound',
                        payload: { market },
                    });

                    // 3. Handle WhatsApp notifications (decoupled)
                    this.sendTwilioNotifications(market);
                }
            }
        } catch (error) {
            console.error('[MarketWatcherDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }

    private async sendTwilioNotifications(market: MarketIntel) {
        try {
            const usersToNotify = await usersCollection.find({
                'notificationSettings.newMarkets': true,
                'phone': { $exists: true, $ne: '' }
            }).toArray();

            if (usersToNotify.length > 0) {
                const message = `🚨 New Market Alert 🚨\n\n*${market.title}*\n\nYes: ${Math.round(market.odds.yes * 100)}¢ | No: ${Math.round(market.odds.no * 100)}¢`;
                for (const user of usersToNotify) {
                    if(user.handle) {
                        await notificationService.logAndSendNotification({
                            userId: user.handle,
                            type: 'newMarkets',
                            message,
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`[MarketWatcherDirector] Error sending Twilio notifications for market ${market.id}:`, error);
        }
    }
}
