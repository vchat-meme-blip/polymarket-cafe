import { Router } from 'express';
import mongoose, { Collection } from 'mongoose';
import { TradeRecord, BettingIntel, MarketWatchlist } from '../../lib/types/shared.js';
import { 
  usersCollection, 
  agentsCollection,
  betsCollection,
  bountiesCollection,
  tradeHistoryCollection,
  transactionsCollection,
  bettingIntelCollection,
  roomsCollection,
  dailySummariesCollection,
  marketWatchlistsCollection,
} from '../db.js';
import { PRESET_AGENTS } from '../../lib/presets/agents.js';
import { aiService } from '../services/ai.service.js';
import { elevenLabsService } from '../services/elevenlabs.service.js';
import { cafeMusicService } from '../services/cafeMusic.service.js';
import { polymarketService } from '../services/polymarket.service.js';
import { kalshiService } from '../services/kalshi.service.js';
import { leaderboardService } from '../services/leaderboard.service.js';
import { Agent, User, Interaction, Room, MarketIntel, AgentMode, Bet, AgentTask, toSharedUser } from '../../lib/types/index.js';
import { createSystemInstructions } from '../../lib/prompts.js';
import { ObjectId } from 'mongodb';
import OpenAI from 'openai';
import { Readable } from 'stream';
import { startOfToday, formatISO } from 'date-fns';
import { seedDatabase } from '../db.js';
import { UserDocument } from '../../lib/types/mongodb.js';

// Add global declaration to extend Express.Request with worker properties.
declare global {
  namespace Express {
    interface Request {
      arenaWorker?: import('worker_threads').Worker;
      autonomyWorker?: import('worker_threads').Worker;
    }
  }
}


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
    const user = await usersCollection.findOne({ handle });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const agents = await agentsCollection.find({ ownerHandle: handle }).toArray();
    const presets = await agentsCollection.find({ ownerHandle: { $exists: false } }).toArray();
    
    const autonomy = { bounties: await bountiesCollection.find({ ownerHandle: handle }).toArray(), intel: await bettingIntelCollection.find({ ownerHandle: handle }).toArray() };
    const wallet = { transactions: await transactionsCollection.find({ ownerHandle: handle }).toArray() };

    const sanitize = (doc: any) => ({ ...doc, id: doc._id.toString(), _id: doc._id.toString() });

    res.json({ 
        user: sanitize(user), 
        agents: agents.map(sanitize),
        presets: presets.map(sanitize), 
        autonomy, 
        wallet 
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

router.post('/users/register', async (req, res) => {
  try {
    const { handle } = req.body;
    if (!handle) return res.status(400).json({ message: 'Handle is required' });
    
    const existing = await usersCollection.findOne({ handle });
    if (existing) return res.status(409).json({ message: 'Handle already taken' });

    const newUser: User = {
      handle,
      name: '',
      info: '',
      hasCompletedOnboarding: false,
      lastSeen: Date.now(),
      userApiKey: null,
      solanaWalletAddress: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      phone: '',
      notificationSettings: {
        agentResearch: true,
        agentTrades: true,
        newMarkets: false,
        agentEngagements: true,
        autonomyCafe: true,
        autonomyEngage: true,
        autonomyResearch: true,
      },
      isAutonomyEnabled: true,
    };

    const result = await usersCollection.insertOne(newUser as any);
    const user = await usersCollection.findOne({_id: result.insertedId});
    res.status(201).json({ user });
  } catch (error) {
    console.error('[API] Error registering user:', error);
    res.status(500).json({ message: 'Failed to register user' });
  }
});

router.put('/users/current-agent', async (req, res) => {
    const { userHandle } = res.locals;
    const { agentId } = req.body;
    if (!userHandle) return res.status(401).json({ message: "Unauthorized" });
    if (!agentId) return res.status(400).json({ message: "Agent ID is required." });

    try {
        const agent = await agentsCollection.findOne({ id: agentId });
        if (!agent) {
            return res.status(404).json({ message: "Agent not found." });
        }

        const result = await usersCollection.updateOne(
            { handle: userHandle },
            { $set: { currentAgentId: agent._id, updatedAt: Date.now() } }
        );
        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }
        res.status(200).json({ message: 'Active agent updated successfully.' });
    } catch (error) {
        console.error('[API] Error setting current agent:', error);
        res.status(500).json({ message: 'Failed to update active agent.' });
    }
});

router.put('/users/settings/notifications', async (req, res) => {
    try {
        const { userHandle } = res.locals;
        if (!userHandle) return res.status(401).json({ message: 'Unauthorized' });

        const { phone, notificationSettings } = req.body;
        
        const updateDoc: any = {};
        if (phone !== undefined) updateDoc.phone = phone;
        if (notificationSettings) updateDoc.notificationSettings = notificationSettings;

        const result = await usersCollection.updateOne({ handle: userHandle }, { $set: updateDoc });

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'Notification settings updated.' });
    } catch (error) {
        console.error('[API] Error updating notification settings:', error);
        res.status(500).json({ message: 'Failed to update notification settings.' });
    }
});

router.put('/users/settings', async (req, res) => {
    const { userHandle } = res.locals;
    const settings = req.body;
    if (!userHandle) return res.status(401).json({ message: "Unauthorized" });

    const allowedUpdates = ['receivingWalletAddress', 'userApiKey', 'isAutonomyEnabled'] as const;
    const finalUpdates: Partial<Pick<User, typeof allowedUpdates[number]>> = {};
    for (const key of allowedUpdates) {
        if (settings[key] !== undefined) {
            (finalUpdates as any)[key] = settings[key];
        }
    }

    if (Object.keys(finalUpdates).length === 0) {
        return res.status(400).json({ message: "No valid settings to update." });
    }

    try {
        const updateDoc = { $set: { ...finalUpdates, updatedAt: Date.now() } };
        const result = await usersCollection.updateOne({ handle: userHandle }, updateDoc);
        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }
        res.status(200).json({ message: 'User settings updated.' });
    } catch (error) {
        console.error('[API] Error updating user settings:', error);
        res.status(500).json({ message: 'Failed to update settings.' });
    }
});


router.post('/users/wallet/connect', async (req, res) => {
  const { address } = req.body;
  const { userHandle } = res.locals;
  if (!userHandle) return res.status(401).json({ message: "Unauthorized" });
  await usersCollection.updateOne({ handle: userHandle }, { $set: { solanaWalletAddress: address, updatedAt: Date.now() } });
  res.status(200).send();
});

router.post('/users/wallet/disconnect', async (req, res) => {
  const { userHandle } = res.locals;
  if (!userHandle) return res.status(401).json({ message: "Unauthorized" });
  await usersCollection.updateOne({ handle: userHandle }, { $set: { solanaWalletAddress: null, updatedAt: Date.now() } });
  res.status(200).send();
});

router.get('/users/recover/:address', async (req, res) => {
  const user = await usersCollection.findOne({ solanaWalletAddress: req.params.address });
  if (!user) return res.status(404).json({ message: 'No account found for this wallet address.' });
  res.json({ handle: user.handle });
});

// --- Agents ---
router.post('/agents', async (req, res) => {
    try {
        const agentData = req.body as Omit<Agent, 'id' | '_id'>;
        
        const newId = new ObjectId();
        
        const newAgent: Agent = {
            ...agentData,
            id: newId.toHexString(), 
            _id: newId, 
            ownerHandle: res.locals.userHandle,
        } as Agent;
        
        const result = await agentsCollection.insertOne(newAgent as any);
        const savedAgent = await agentsCollection.findOne({ _id: result.insertedId });

        if (savedAgent) {
            req.arenaWorker?.postMessage({ type: 'registerNewAgent', payload: { agent: savedAgent } });
            res.status(201).json({ agent: savedAgent });
        } else {
            throw new Error('Failed to retrieve saved agent from database.');
        }

    } catch (error) {
        console.error('[API] Error creating agent:', error);
        res.status(500).json({ message: 'Failed to create agent.' });
    }
});

router.put('/agents/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const updates = req.body;
  delete updates._id; 
  const result = await agentsCollection.findOneAndUpdate(
    { id: agentId, ownerHandle: res.locals.userHandle },
    { $set: updates },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ message: 'Agent not found or not owned by user' });
  res.json({ agent: result });
});

router.post('/agents/:agentId/intel', async (req, res) => {
    const { agentId } = req.params;
    const intelData = req.body;
    try {
        const agent = await agentsCollection.findOne({ id: agentId });
        if (!agent) {
            return res.status(404).json({ message: 'Agent not found.' });
        }
        const newIntel = {
            ...intelData,
            _id: new ObjectId(),
            ownerAgentId: agent._id,
            createdAt: new Date(),
        };
        await bettingIntelCollection.insertOne(newIntel as any);
        res.status(201).json(newIntel);
    } catch (error) {
        console.error(`[API] Error adding intel for agent ${agentId}:`, error);
        res.status(500).json({ message: 'Failed to add intel' });
    }
});

router.get('/agents/:agentId/activity', async (req, res) => {
  const { agentId } = req.params;
  const todayStr = formatISO(startOfToday(), { representation: 'date' });

  try {
    const agentObjectId = new ObjectId(agentId);
    let dailySummary = await dailySummariesCollection.findOne({ agentId: agentObjectId, date: todayStr });
    
    if (dailySummary) {
      return res.json({ summary: dailySummary.summary });
    }

    const [recentTradesDocs, recentIntelDocs] = await Promise.all([
        tradeHistoryCollection.find({ $or: [{ fromId: agentObjectId }, { toId: agentObjectId }] }).sort({ timestamp: -1 }).limit(10).toArray(),
        bettingIntelCollection.find({ ownerAgentId: agentObjectId }).sort({ createdAt: -1 }).limit(5).toArray()
    ]);
    
    const recentTrades: TradeRecord[] = recentTradesDocs.map(doc => ({
        ...doc,
        id: doc._id.toString(),
        fromId: doc.fromId.toString(),
        toId: doc.toId.toString(),
        roomId: doc.roomId.toString(),
        timestamp: new Date(doc.timestamp).getTime(),
    } as any));

    const recentIntel: BettingIntel[] = recentIntelDocs.map(doc => ({
        ...doc,
        id: doc._id.toString(),
        ownerAgentId: doc.ownerAgentId.toString(),
        sourceAgentId: doc.sourceAgentId?.toString(),
        bountyId: doc.bountyId?.toString(),
        createdAt: new Date(doc.createdAt).getTime(),
    } as any));
    
    const activities = { trades: recentTrades, intel: recentIntel };
    const newSummaryText = await aiService.generateDailySummary(activities);

    if (newSummaryText) {
      const newSummary = { agentId: agentObjectId, date: todayStr, summary: newSummaryText };
      await dailySummariesCollection.insertOne(newSummary as any);
      return res.json({ summary: newSummaryText });
    } else {
        return res.json({ summary: "No significant activity to report for today." });
    }
    
  } catch (error) {
      console.error(`[API] Error getting activity for agent ${agentId}:`, error);
      res.status(500).json({ message: "Failed to generate activity summary." });
  }
});
  
router.post('/agents/:agentId/watchlists', async (req, res) => {
    const { agentId } = req.params;
    const { userHandle } = res.locals;
    const watchlistData = req.body;

    try {
        const agent = await agentsCollection.findOne({ id: agentId, ownerHandle: userHandle });
        if (!agent) {
            return res.status(404).json({ message: 'Agent not found or you do not own this agent.' });
        }
        
        const newWatchlist: Omit<MarketWatchlist, 'id'> & { _id: ObjectId, id: string } = {
            _id: new ObjectId(),
            id: '',
            name: watchlistData.name,
            markets: watchlistData.markets,
            createdAt: Date.now(),
            isTradable: watchlistData.isTradable,
            price: watchlistData.price,
        };
        newWatchlist.id = newWatchlist._id.toHexString();

        await agentsCollection.updateOne(
            { _id: agent._id },
            { $push: { marketWatchlists: newWatchlist as any } }
        );

        res.status(201).json({ watchlist: newWatchlist });
    } catch (error) {
        console.error('Error adding watchlist:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/agents/:agentId/watchlists/:watchlistId', async (req, res) => {
    const { agentId, watchlistId } = req.params;
    const { userHandle } = res.locals;

    try {
        const result = await agentsCollection.updateOne(
            { id: agentId, ownerHandle: userHandle },
            { $pull: { marketWatchlists: { id: watchlistId } as any } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Watchlist not found or you do not own this agent.' });
        }

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting watchlist:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// --- Agent Tasks ---
router.get('/agents/:agentId/tasks', async (req, res) => {
    const { agentId } = req.params;
    try {
        const agent = await agentsCollection.findOne({ id: agentId });
        if (!agent) {
            return res.status(404).send('Agent not found');
        }
        res.json((agent as any).tasks || []);
    } catch (error) {
        console.error(`[API] Error fetching tasks for agent ${agentId}:`, error);
        res.status(500).json({ message: 'Failed to fetch tasks.' });
    }
});

router.post('/agents/:agentId/tasks', async (req, res) => {
  const { agentId } = req.params;
  const { userHandle } = res.locals;
  const taskData = req.body;

  try {
      const agent = await agentsCollection.findOne({ id: agentId, ownerHandle: userHandle });
      if (!agent) {
          return res.status(404).json({ message: 'Agent not found or you do not own this agent.' });
      }

      const newTask: AgentTask = {
          ...taskData,
          id: new ObjectId().toHexString(),
          agentId: agentId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          updates: [{
              timestamp: Date.now(),
              message: `Task created: "${taskData.objective}"`
          }],
      };

      await agentsCollection.updateOne(
          { _id: agent._id },
          { $push: { tasks: newTask as any } }
      );

      res.status(201).json(newTask);
  } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/agents/:agentId/tasks/:taskId', async (req, res) => {
    const { agentId, taskId } = req.params;
    const { userHandle } = res.locals;
    const updates = req.body;

    try {
        const agent = await agentsCollection.findOne({ id: agentId, ownerHandle: userHandle });
        if (!agent) {
            return res.status(404).json({ message: 'Agent not found or you do not own this agent.' });
        }

        const updateQuery: { $set: any, $push?: any } = { $set: {} };
        for (const key in updates) {
            if (key !== 'updates') {
                updateQuery.$set[`tasks.$.${key}`] = updates[key];
            }
        }
        updateQuery.$set['tasks.$.updatedAt'] = Date.now();

        const result = await agentsCollection.updateOne(
            { _id: agent._id, 'tasks.id': taskId },
            updateQuery
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Task not found or no changes made.' });
        }
        
        const updatedAgent = await agentsCollection.findOne({ _id: agent._id });
        const updatedTask = (updatedAgent as any)?.tasks.find((t: AgentTask) => t.id === taskId);

        res.status(200).json(updatedTask);
    } catch (error) {
        console.error(`Error updating task ${taskId}:`, error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/agents/:agentId/tasks/:taskId', async (req, res) => {
    const { agentId, taskId } = req.params;
    const { userHandle } = res.locals;

    try {
        const result = await agentsCollection.updateOne(
            { id: agentId, ownerHandle: userHandle },
            { $pull: { tasks: { id: taskId } as any } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Task not found or you do not own this agent.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error(`Error deleting task ${taskId}:`, error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// --- Agent Actions & AI ---
router.post('/ai/brainstorm-personality', async (req, res) => {
  try {
    const apiKey = (process.env.OPENAI_API_KEYS || '').split(',')[0] || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Server AI API key is not configured.");
    
    const openai = new OpenAI({ apiKey });
    const prompt = `Brainstorm a detailed, first-person personality for an AI agent in a SocialFi simulation called "Quants Café". The agent's personality should be based on these keywords: "${req.body.keywords}". The description must be under 80 words.`;
    
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
    });

    res.json({ personality: completion.choices[0].message.content?.trim() ?? '' });
  } catch (e: any) {
    console.error('[API] Brainstorm error:', e);
    res.status(500).json({ message: e.message });
  }
});

router.post('/ai/analyze-market', async (req, res) => {
    const { agentId, market, comments } = req.body;
    const agent = await agentsCollection.findOne({ id: agentId });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    
    try {
        const analysis = await aiService.analyzeMarket(agent as any, market, comments);
        res.json({ analysis });
    } catch (error: any) {
        console.error('Error in analyze-market:', error);
        res.status(500).json({ message: error.message });
    }
});

router.post('/ai/direct-message', async (req, res) => {
    const { agentId, message, history } = req.body;
    const { userHandle } = res.locals;

    try {
        const user = await usersCollection.findOne({ handle: userHandle });
        const agent = await agentsCollection.findOne({ id: agentId });

        if (!user || !agent) {
            return res.status(404).json({ message: 'User or agent not found' });
        }
        
        const apiKey = user.userApiKey || (process.env.OPENAI_API_KEYS || '').split(',')[0] || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(403).json({ message: 'No API key available. Please configure your user API key in Settings.' });
        }

        const agentMessage = await aiService.getDirectMessageResponse(agent as any, user as any, message, history, apiKey);
        
        res.json({ agentMessage });

    } catch (error) {
        console.error('[API] Direct message error:', error);
        res.status(500).json({ message: 'Error communicating with AI model' });
    }
});

router.post('/ai/transcribe', async (req, res) => {
  res.json({ text: "This is a mock transcription of your audio." });
});

router.post('/ai/suggest-bet', async (req, res) => {
    try {
        const { query, agentId } = req.body;
        const result = await aiService.suggestBet(query, agentId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});


// --- Markets & Betting ---
router.get('/markets/live', async (req, res) => {
  try {
    const { category, page, limit } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    
    const { markets, hasMore } = await polymarketService.searchMarkets('', category as string | undefined, pageNum, limitNum);

    res.json({ markets, hasMore });
  } catch (error) {
    console.error('[API] Failed to fetch live markets:', error);
    res.status(500).json({ message: 'Failed to fetch live markets' });
  }
});

router.get('/markets/liquidity', async (req, res) => {
    try {
        const markets = await polymarketService.getLiquidityOpportunities();
        res.json(markets);
    } catch (error) {
        console.error('[API] Failed to fetch liquidity opportunities:', error);
        res.status(500).json({ message: 'Failed to fetch liquidity opportunities' });
    }
});

router.get('/markets/comments/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const comments = await polymarketService.getMarketComments(eventId, 'Event');
        res.json(comments);
    } catch (error) {
        console.error('[API] Failed to fetch event comments:', error);
        res.status(500).json({ message: 'Failed to fetch event comments' });
    }
});

router.get('/markets/:marketId/comments', async (req, res) => {
    try {
        const { marketId } = req.params;
        const comments = await polymarketService.getMarketComments(marketId, 'Market');
        res.json(comments);
    } catch (error) {
        console.error('[API] Failed to fetch market comments:', error);
        res.status(500).json({ message: 'Failed to fetch market comments' });
    }
});

router.post('/bets', async (req, res) => {
  const betData = req.body;
  const newBet = {
    ...betData,
    id: `bet-${new ObjectId().toHexString()}`,
    timestamp: Date.now(),
    status: 'pending'
  };
  await betsCollection.insertOne(newBet as any);
  await agentsCollection.updateOne({ id: betData.agentId }, { $push: { bettingHistory: newBet as any }});
  res.status(201).send();
});


// --- Other Services ---
router.get('/stats', async (req, res) => {
  res.json({
    directors: {
      autonomy: { status: 'Running', lastTick: new Date().toISOString() },
      arena: { status: 'Running', lastTick: new Date().toISOString() }
    },
    simulation: {
      totalAgents: await agentsCollection.countDocuments(),
      activeRooms: await roomsCollection.countDocuments({ 'agentIds.0': { $exists: true } }),
      liveConversations: await roomsCollection.countDocuments({ 'agentIds.1': { $exists: true } }),
      totalTrades: await tradeHistoryCollection.countDocuments()
    }
  });
});

router.get('/tts-voices', async (req, res) => {
  res.json(elevenLabsService.getAvailableVoices());
});

router.post('/tts', async (req, res) => {
  try {
    const stream = await elevenLabsService.synthesizeSpeech(req.body);
    res.setHeader('Content-Type', 'audio/mpeg');
    Readable.fromWeb(stream as any).pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leaderboard/pnl', async (req, res) => {
    res.json(await leaderboardService.getPnlLeaderboard());
});

router.get('/leaderboard/intel', async (req, res) => {
    res.json(await leaderboardService.getIntelLeaderboard());
});

// Arena Actions
router.post('/arena/send-to-cafe', (req, res) => {
    req.arenaWorker?.postMessage({ type: 'moveAgentToCafe', payload: req.body });
    res.status(202).send();
});

router.post('/arena/recall-agent', (req, res) => {
    req.arenaWorker?.postMessage({ type: 'recallAgent', payload: req.body });
    res.status(202).send();
});

router.post('/arena/create-room', (req, res) => {
    req.arenaWorker?.postMessage({ type: 'createAndHostRoom', payload: req.body });
    res.status(202).send();
});

router.post('/rooms/purchase', async (req, res) => {
    const { name } = req.body;
    const { userHandle } = res.locals;
    try {
        const newRoom = {
            _id: new ObjectId(),
            id: '',
            name,
            agentIds: [],
            hostId: null,
            topics: [],
            warnFlags: 0,
            rules: ['All sales are final.'],
            activeOffer: null,
            vibe: 'General Chat ☕️',
            isOwned: true,
            ownerHandle: userHandle,
        };
        newRoom.id = newRoom._id.toHexString();
        const result = await roomsCollection.insertOne(newRoom as any);
        const userDoc = await usersCollection.findOneAndUpdate(
            { handle: userHandle },
            { $set: { ownedRoomId: result.insertedId } },
            { returnDocument: 'after' }
        );
        
        const roomForPayload = { ...newRoom };
        req.arenaWorker?.postMessage({ type: 'roomUpdated', payload: { room: roomForPayload } });
        
        const user = userDoc ? toSharedUser(userDoc as UserDocument) : null;
        res.status(201).json({ room: roomForPayload, user });
    } catch (error) {
        console.error('[API] Error purchasing room:', error);
        res.status(500).json({ message: "Failed to purchase room" });
    }
});

router.put('/rooms/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const updates = req.body;
    const { userHandle } = res.locals;
    try {
        const result = await roomsCollection.findOneAndUpdate(
            { id: roomId, ownerHandle: userHandle },
            { $set: updates },
            { returnDocument: 'after' }
        );
        if (!result) {
            return res.status(404).json({ message: "Room not found or you are not the owner." });
        }
        req.arenaWorker?.postMessage({ type: 'roomUpdated', payload: { room: result } });
        res.json({ room: result });
    } catch (error) {
        res.status(500).json({ message: "Failed to update room" });
    }
});

router.delete('/rooms/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { userHandle } = res.locals;
    try {
        const result = await roomsCollection.deleteOne({ id: roomId, ownerHandle: userHandle });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Room not found or you are not the owner." });
        }
        await usersCollection.updateOne({ handle: userHandle }, { $unset: { ownedRoomId: "" } });
        req.arenaWorker?.postMessage({ type: 'roomDeleted', payload: { roomId } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: "Failed to delete room" });
    }
});


router.post('/arena/kick', (req, res) => {
    req.arenaWorker?.postMessage({ type: 'kickAgent', payload: req.body });
    res.status(202).send();
});

router.post('/autonomy/start-research', (req, res) => {
    req.autonomyWorker?.postMessage({ type: 'startResearch', payload: req.body });
    res.status(202).send();
});

// Music Service Endpoint
router.get('/music/cafe/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { refresh } = req.query;

    if (!elevenLabsService.isConfigured()) {
        return res.status(503).json({ error: 'Music service is not configured.' });
    }

    try {
        const { buffer, prompt } = await cafeMusicService.getTrack(roomId, { forceRefresh: !!refresh });
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-Music-Prompt', prompt);
        res.send(buffer);
    } catch (error) {
        console.error(`[API] Error generating music for room ${roomId}:`, error);
        res.status(500).json({ error: 'Failed to generate music.' });
    }
});

export default router;