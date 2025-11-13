
import { Router } from 'express';
import mongoose, { Collection } from 'mongoose';
import { TradeRecord, BettingIntel, MarketWatchlist } from '../../lib/types/shared.js';
import { 
  usersCollection, 
  agentsCollection,
  betsCollection,
  tradeHistoryCollection,
  transactionsCollection,
  bettingIntelCollection,
  roomsCollection,
  dailySummariesCollection,
  marketWatchlistsCollection,
  activityLogCollection,
  agentInteractionsCollection,
  newMarketsCacheCollection,
} from '../db.js';
import { aiService } from '../services/ai.service.js';
import { elevenLabsService } from '../services/elevenlabs.service.js';
import { cafeMusicService } from '../services/cafeMusic.service.js';
import { polymarketService } from '../services/polymarket.service.js';
import { kalshiService } from '../services/kalshi.service.js';
import { leaderboardService } from '../services/leaderboard.service.js';
import { Agent, User, Interaction, Room, MarketIntel, AgentMode, Bet, AgentTask, toSharedUser, Transaction } from '../../lib/types/index.js';
import { createSystemInstructions } from '../../lib/prompts.js';
import { ObjectId, WithId } from 'mongodb';
import OpenAI from 'openai';
import { Readable } from 'stream';
import { startOfToday, formatISO } from 'date-fns';
import { seedDatabase } from '../db.js';
import { UserDocument, TransactionDocument } from '../../lib/types/mongodb.js';

const router = Router();

// Middleware to get user handle from header
router.use((req, res, next) => {
  const handle = req.header('X-User-Handle');
  res.locals.userHandle = handle;
  next();
});

// --- Health Check ---
router.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// --- System Actions ---
router.post('/system/reset-database', async (req, res) => {
    try {
        console.log('[API] Received request to reset database.');
        
        if (!mongoose.connection.db) {
            throw new Error('Database connection not established');
        }
        
        const collections = await mongoose.connection.db.listCollections().toArray();
        await Promise.all(collections.map(async (collection: { name: string }) => {
            if (collection.name !== 'system.indexes') {
                await mongoose.connection.db?.dropCollection(collection.name);
                console.log(`[API] Dropped collection: ${collection.name}`);
            }
        }));
        
        console.log('[API] All collections dropped.');
        
        await seedDatabase();

        req.arenaWorker?.postMessage({ type: 'reinitialize' });

        res.status(200).json({ message: 'Database reset and re-seeded successfully.' });
    } catch (error) {
        console.error('[API] Error resetting database:', error);
        res.status(500).json({ message: 'Failed to reset database.' });
    }
});


// --- User & Auth ---
router.get('/bootstrap/:handle', async (req, res) => {
  try {
    const handle = req.params.handle;
    const userDoc = await usersCollection.findOne({ handle });
    if (!userDoc) return res.status(404).json({ message: 'User not found' });

    const userObject = { ...userDoc };

    // Self-healing: Check if the user's owned room still exists.
    if (userObject.ownedRoomId) {
        const roomExists = await roomsCollection.findOne({ _id: userObject.ownedRoomId });
        if (!roomExists) {
            console.warn(`[Bootstrap] Stale ownedRoomId (${userObject.ownedRoomId}) found for user ${handle}. Clearing.`);
            // Update the DB to fix the inconsistency
            await usersCollection.updateOne({ _id: userObject._id }, { $set: { ownedRoomId: null } });
            // Set property to null on the mutable copy we're about to send to the client
            (userObject as any).ownedRoomId = null;
        }
    }
    const user = userObject;

    const agents = await agentsCollection.find({ ownerHandle: handle }).toArray();
    const presets = await agentsCollection.find({ ownerHandle: { $exists: false } }).toArray();
    
    const agentObjectIds = agents.map(a => a._id);
    
    // --- Autonomy Data ---
    const autonomy = { 
        intel: await bettingIntelCollection.find({ ownerHandle: handle }).toArray(),
        activityLog: await activityLogCollection.find({ agentId: { $in: agents.map(a => a.id) } }).sort({ timestamp: -1 }).limit(100).toArray(),
        tasks: agents.flatMap(a => (a as any).tasks || [])
    };
    
    // --- Wallet Data ---
    const transactions = await transactionsCollection.find({ ownerHandle: handle }).toArray();
    const balance = transactions.reduce((acc: number, tx: WithId<TransactionDocument>) => {
        if (['receive', 'claim', 'stipend'].includes(tx.type)) {
            return acc + tx.amount;
        } else if (['send', 'room_purchase', 'escrow'].includes(tx.type)) {
            return acc - tx.amount;
        }
        return acc;
    }, 0);

    const wallet = { transactions, balance };

    // --- Arena Data ---
    const allInteractions = await agentInteractionsCollection.find({ 
        $or: [
            { "agentId": { "$in": agents.map(a => a.id) } },
            { "roomId": { "$in": agents.map(a => `dm_${a.id}_user`) } },
            { "roomId": { "$in": agents.map(a => `dm_user_${a.id}`) } }
        ]
     }).toArray();
    const tradeHistory = await tradeHistoryCollection.find({ $or: [{ fromId: { $in: agentObjectIds } }, { toId: { $in: agentObjectIds } }] }).toArray();
    const allRooms = await roomsCollection.find({}).toArray();

    const arena = {
        rooms: allRooms,
        conversations: allInteractions,
        tradeHistory: tradeHistory,
    };

    const sanitize = (doc: any) => ({ ...doc, id: doc._id.toString(), _id: doc._id.toString() });

    res.json({ 
        user: sanitize(user), 
        agents: agents.map(sanitize),
        presets: presets.map(sanitize), 
        autonomy, 
        wallet,
        arena,
    });
  } catch (error) {
    console.error('[API] Error during bootstrap:', error);
    res.status(500).json({ message: 'Server error during bootstrap' });
  }
});
  
router.get('/users/check-handle/:handle', async (req, res) => {
  try {
    const user = await usersCollection.findOne({ handle: req.params.handle });
    res.json({ available: !user, isNewUser: !user });
  } catch (error) {
    console.error('[API] Error checking handle:', error);
    res.status(500).json({ message: 'Server error checking handle' });
  }
});

router.put('/users/bookmarks', async (req, res) => {
    const { userHandle } = res.locals;
    if (!userHandle) return res.status(401).json({ message: "Unauthorized" });

    const { marketId, bookmarked } = req.body;
    if (!marketId || typeof bookmarked !== 'boolean') {
        return res.status(400).json({ message: "marketId and bookmarked status are required." });
    }

    try {
        const updateOperation = bookmarked
            ? { $addToSet: { bookmarkedMarketIds: marketId } }
            : { $pull: { bookmarkedMarketIds: marketId } };

        const result = await usersCollection.updateOne({ handle: userHandle }, updateOperation as any);

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }
        res.status(200).json({ message: 'Bookmarks updated.' });
    } catch (error) {
        console.error('[API] Error updating bookmarks:', error);
        res.status(500).json({ message: 'Failed to update bookmarks.' });
    }
});

// ... (rest of the file remains the same until Markets section)

// --- Markets & Betting ---
router.post('/markets/by-ids', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
        return res.status(400).json({ message: 'Request body must be an array of market IDs.' });
    }

    try {
        // This is a simplified fetch. In a real scenario, you'd have a dedicated markets collection
        // or a more efficient way to get multiple markets from the service.
        const { markets: allLiveMarkets } = await polymarketService.getLiveMarkets(500); // Fetch a large number
        const foundMarkets = allLiveMarkets.filter(market => ids.includes(market.id));
        res.json(foundMarkets);
    } catch (error) {
        console.error('[API] Failed to fetch markets by IDs:', error);
        res.status(500).json({ message: 'Failed to fetch markets.' });
    }
});

router.get('/markets/new-cached', async (req, res) => {
    try {
        const cachedMarkets = await newMarketsCacheCollection.find({}).sort({ detectedAt: -1 }).limit(50).toArray();
        res.json(cachedMarkets);
    } catch (error) {
        console.error('[API] Failed to fetch new cached markets:', error);
        res.status(500).json({ message: 'Failed to fetch cached markets.' });
    }
});

router.get('/markets/live', async (req, res) => {
    // Add your live markets route handler here
    res.json({ message: 'Live markets endpoint' });
});

// Export the router as a named export
export { router };
