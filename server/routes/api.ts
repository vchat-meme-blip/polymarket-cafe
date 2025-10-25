import { Router } from 'express';
import mongoose, { Collection } from 'mongoose';
import { TradeRecord, BettingIntel } from '../../lib/types/shared.js';
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
} from '../db.js';
import { PRESET_AGENTS } from '../../lib/presets/agents.js';
import { aiService } from '../services/ai.service.js';
import { elevenLabsService } from '../services/elevenlabs.service.js';
import { cafeMusicService } from '../services/cafeMusic.service.js';
import { polymarketService } from '../services/polymarket.service.js';
import { kalshiService } from '../services/kalshi.service.js';
import { leaderboardService } from '../services/leaderboard.service.js';
import { Agent, User, Interaction, Room, MarketIntel, AgentMode, Bet } from '../../lib/types/index.js';
import { createSystemInstructions } from '../../lib/prompts.js';
import { ObjectId } from 'mongodb';
import OpenAI from 'openai';
import { Readable } from 'stream';
import { startOfToday, formatISO } from 'date-fns';

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
        
        // Ensure database connection is established
        if (!mongoose.connection.db) {
            throw new Error('Database connection not established');
        }
        
        // Drop all collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        await Promise.all(collections.map(async (collection: { name: string }) => {
            await mongoose.connection.db?.dropCollection(collection.name);
        }));
        
        console.log('[API] Database dropped successfully.');
        
        // Re-seed MCP agents
        const mcpOps = PRESET_AGENTS.map(agent => ({
            updateOne: {
                filter: { id: agent.id },
                update: { $setOnInsert: agent },
                upsert: true
            }
        }));
        
        if (mcpOps.length > 0) {
            await agentsCollection.bulkWrite(mcpOps as any);
            console.log('[API] Re-seeded MCPs into the database.');
        }

        res.status(200).json({ message: 'Database reset successfully.' });
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
    
    const autonomy = { bounties: await bountiesCollection.find({ ownerHandle: handle }).toArray(), intel: await bettingIntelCollection.find({ ownerHandle: handle }).toArray() };
    const wallet = { transactions: await transactionsCollection.find({ ownerHandle: handle }).toArray() };

    res.json({ user, agents, autonomy, wallet });
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
        agentEngagements: false,
      },
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
        const result = await usersCollection.updateOne(
            { handle: userHandle },
            { $set: { currentAgentId: agentId, updatedAt: Date.now() } }
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
    const { userHandle } = res.locals;
    const { phone, notificationSettings } = req.body;
    if (!userHandle) return res.status(401).json({ message: "Unauthorized" });

    try {
        const updateDoc: any = { $set: {} };
        if (phone !== undefined) {
            updateDoc.$set.phone = phone;
        }
        if (notificationSettings !== undefined) {
            updateDoc.$set.notificationSettings = notificationSettings;
        }
        updateDoc.$set.updatedAt = Date.now();
        
        const result = await usersCollection.updateOne(
            { handle: userHandle },
            updateDoc
        );
        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }
        res.status(200).json({ message: 'Notification settings updated.' });
    } catch (error) {
        console.error('[API] Error updating notification settings:', error);
        res.status(500).json({ message: 'Failed to update settings.' });
    }
});

router.put('/api/users/api-key', async (req, res) => {
    const { userHandle } = res.locals;
    const { apiKey } = req.body;
    if (!userHandle) return res.status(401).json({ message: "Unauthorized" });

    try {
        await usersCollection.updateOne(
            { handle: userHandle },
            { $set: { userApiKey: apiKey, updatedAt: Date.now() } }
        );
        res.status(200).json({ message: 'API key updated successfully.' });
    } catch (error) {
        console.error('[API] Error updating user API key:', error);
        res.status(500).json({ message: 'Failed to update API key.' });
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
  const newAgent = req.body as Agent;
  newAgent.ownerHandle = res.locals.userHandle;
  await agentsCollection.insertOne(newAgent as any);
  req.arenaWorker?.postMessage({ type: 'registerNewAgent', payload: { agent: newAgent } });
  res.status(201).json({ agent: newAgent });
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

// --- AI Endpoints ---
router.post('/ai/brainstorm-personality', async (req, res) => {
  try {
    const apiKey = (process.env.OPENAI_API_KEYS || '').split(',')[0] || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Server AI API key is not configured.");
    
    const openai = new OpenAI({ apiKey });
    const prompt = `Brainstorm a detailed, first-person personality for an AI agent in a SocialFi simulation. The personality should be based on these keywords: "${req.body.keywords}". The description must be under 80 words.`;
    
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }]
    });

    res.json({ personality: completion.choices[0].message.content?.trim() ?? '' });
  } catch (e: any) {
    console.error('[API] Brainstorm error:', e);
    res.status(500).json({ message: e.message });
  }
});

router.post('/ai/analyze-market', async (req, res) => {
    const { agentId, market, comments } = req.body;
    const agentDoc = await agentsCollection.findOne({ id: agentId });
    if (!agentDoc) return res.status(404).json({ message: 'Agent not found' });
    
    // Fetch and map the bet