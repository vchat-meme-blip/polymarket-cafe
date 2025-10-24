import { usersCollection } from '../db.js';
import { polymarketService } from '../services/polymarket.service.js';
import { notificationService } from '../services/notification.service.js';

export class MarketWatcherDirector {
    private lastSeenMarketId: number = 0;
    private isTicking = false;

    constructor() {
        console.log('[MarketWatcherDirector] Initialized.');
        this.initializeLastSeenId();
    }

    private async initializeLastSeenId() {
        // Initialize with the ID of the most recent market to avoid spamming on first run
        try {
            const { markets } = await polymarketService.getLiveMarkets(1);
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
                // The API returns most recent first, so the first element is the newest
                this.lastSeenMarketId = newMarkets[0].numericId;
                console.log(`[MarketWatcherDirector] Found ${newMarkets.length} new market(s). New last seen ID: ${this.lastSeenMarketId}`);

                const usersToNotify = await usersCollection.find({
                    'notificationSettings.newMarkets': true,
                    'phone': { $exists: true, $ne: '' }
                }).toArray();

                if (usersToNotify.length > 0) {
                    for (const market of newMarkets) {
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
                }
            }
        } catch (error) {
            console.error('[MarketWatcherDirector] Error during tick:', error);
        } finally {
            this.isTicking = false;
        }
    }
}