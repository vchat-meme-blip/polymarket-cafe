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
import { seedDatabase } from '../db.js';

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
        
        // Re-run the comprehensive seeding logic
        await seedDatabase();

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
        
        // Server is the authority for IDs.
        const newId = new ObjectId();
        
        const newAgent: Agent = {
            ...agentData,
            id: newId.toHexString(), // The string representation for client-side use
            _id: newId, // The ObjectId for database use
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

// --- AI Endpoints ---
router.post('/ai/brainstorm-personality', async (req, res) => {
  try {
    const apiKey = (process.env.OPENAI_API_KEYS || '').split(',')[0] || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Server AI API key is not configured.");
    
    const openai = new OpenAI({ apiKey });
    const prompt = `Brainstorm a detailed, first-person personality for an AI agent in a SocialFi simulation. The personality should be based on these keywords: "${req.body.keywords}". The description must be under 80 words.`;
    
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
    const agentDoc = await agentsCollection.findOne({ id: agentId });
    if (!agentDoc) return res.status(404).json({ message: 'Agent not found' });
    
    // Fetch and map the bet documents to match the Bet type with all required fields
    const bettingHistory: Bet[] = [];
    
    if (agentDoc.bettingHistory?.length) {
        const betDocs = await betsCollection.find({ 
            _id: { $in: agentDoc.bettingHistory } 
        }).toArray();
        
        for (const betDoc of betDocs) {
            // Ensure all required Bet fields are present
            const bet: Bet = {
                id: betDoc._id.toString(),
                agentId: betDoc.agentId?.toString() || '',
                marketId: betDoc.marketId?.toString() || '',
                outcome: betDoc.outcome || 'yes', // Default to 'yes' if not specified
                amount: betDoc.amount || 0,
                price: betDoc.price || 0,
                timestamp: betDoc.timestamp instanceof Date ? betDoc.timestamp.getTime() : Date.now(),
                status: betDoc.status || 'pending',
                pnl: betDoc.pnl,
                sourceIntelId: betDoc.sourceIntelId?.toString()
            };
            bettingHistory.push(bet);
        }
    }
    
    // Create a new agent object with all required properties from the Agent type
    const agent: Agent = {
        id: agentDoc.id,
        name: agentDoc.name,
        personality: agentDoc.personality || '',
        instructions: agentDoc.instructions || '',
        voice: agentDoc.voice || '',
        topics: Array.isArray(agentDoc.topics) ? [...agentDoc.topics] : [],
        wishlist: Array.isArray(agentDoc.wishlist) ? [...agentDoc.wishlist] : [],
        reputation: agentDoc.reputation || 0,
        isShilling: Boolean(agentDoc.isShilling),
        shillInstructions: agentDoc.shillInstructions || '',
        modelUrl: agentDoc.modelUrl || '',
        bettingHistory,
        currentPnl: agentDoc.currentPnl || 0,
        ownerHandle: agentDoc.ownerHandle,
        // Initialize missing required properties with default values
        bettingIntel: agentDoc.bettingIntel || [],
        marketWatchlists: agentDoc.marketWatchlists || [],
        boxBalance: agentDoc.boxBalance || 0,
        portfolio: agentDoc.portfolio || {},
        // Include any other properties from the document that we haven't explicitly set
        ...Object.fromEntries(
            Object.entries(agentDoc as any).filter(([key]) => 
                ![
                    'id', 'name', 'personality', 'instructions', 'voice', 'topics', 
                    'wishlist', 'reputation', 'isShilling', 'shillInstructions', 
                    'modelUrl', 'bettingHistory', 'currentPnl', 'ownerHandle',
                    'bettingIntel', 'marketWatchlists', 'boxBalance', 'portfolio'
                ].includes(key)
            )
        )
    };
    
    try {
        const analysis = await aiService.analyzeMarket(agent, market, comments);
        res.json({ analysis });
    } catch (error: any) {
        console.error('Error in analyze-market:', error);
        res.status(500).json({ message: error.message });
    }
});

const searchMarketsTool: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'search_markets',
        description: 'Search for prediction markets on Polymarket based on a query.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query for markets, e.g., "Trump election".',
                },
            },
            required: ['query'],
        },
    },
};

const getWalletPositionsTool: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'get_wallet_positions',
        description: "Get the current prediction market positions for a given wallet address from Polymarket's data API.",
        parameters: {
            type: 'object',
            properties: {
                wallet_address: {
                    type: 'string',
                    description: 'The wallet address to look up.',
                },
            },
            required: ['wallet_address'],
        },
    },
};

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
        
        const openai = new OpenAI({ apiKey });
        // Map the agent document to the Agent type
        // Create a new agent object with required fields
        const agentWithBets: Agent = {
            id: agent._id.toString(),
            name: agent.name,
            personality: agent.personality || '',
            instructions: agent.instructions || '',
            voice: agent.voice || '',
            topics: Array.isArray(agent.topics) ? [...agent.topics] : [],
            wishlist: Array.isArray(agent.wishlist) ? [...agent.wishlist] : [],
            reputation: agent.reputation || 0,
            isShilling: Boolean(agent.isShilling),
            shillInstructions: agent.shillInstructions || '',
            modelUrl: agent.modelUrl || '',
            bettingHistory: [], // Will be populated below
            currentPnl: agent.currentPnl || 0,
            ownerHandle: agent.ownerHandle,
            // Add any other required Agent properties with defaults
            bettingIntel: [],
            marketWatchlists: [],
            boxBalance: 0,
            portfolio: {}
        };

        // If there are bets, fetch and map them
        if (agent.bettingHistory?.length) {
            const betDocs = await betsCollection.find({ 
                _id: { $in: agent.bettingHistory } 
            }).toArray();

            agentWithBets.bettingHistory = betDocs.map(betDoc => ({
                id: betDoc._id.toString(),
                agentId: betDoc.agentId?.toString() || '',
                marketId: betDoc.marketId?.toString() || '',
                outcome: betDoc.outcome || 'yes',
                amount: betDoc.amount || 0,
                price: betDoc.price || 0,
                timestamp: betDoc.timestamp instanceof Date ? betDoc.timestamp.getTime() : Date.now(),
                status: betDoc.status || 'pending',
                pnl: betDoc.pnl,
                sourceIntelId: betDoc.sourceIntelId?.toString()
            }));
        }

        // Map the user document to the User type
        const mappedUser: User = {
            _id: user._id.toString(),
            name: user.name || '',
            info: user.info || '',
            handle: user.handle,
            hasCompletedOnboarding: Boolean(user.hasCompletedOnboarding),
            lastSeen: user.lastSeen || null,
            userApiKey: user.userApiKey || null,
            solanaWalletAddress: user.solanaWalletAddress || null,
            createdAt: user.createdAt || Date.now(),
            updatedAt: user.updatedAt || Date.now(),
            currentAgentId: user.currentAgentId?.toString(),
            ownedRoomId: user.ownedRoomId?.toString(),
            phone: user.phone,
            notificationSettings: user.notificationSettings || {
                agentResearch: true,
                agentTrades: true,
                newMarkets: true,
                agentEngagements: true
            }
        };

        const systemInstruction = createSystemInstructions(agentWithBets, mappedUser, false);

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemInstruction },
            ...(history || []).map((msg: Interaction) => ({
                role: msg.agentId === 'user' ? 'user' : 'assistant',
                content: msg.text,
            })),
            { role: 'user', content: message }
        ];
        
        let foundMarkets: MarketIntel[] = [];

        let response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            tools: [searchMarketsTool, getWalletPositionsTool],
            tool_choice: 'auto',
        });

        let responseMessage = response.choices[0].message;
        
        while (responseMessage.tool_calls) {
            messages.push(responseMessage);
            const toolCalls = responseMessage.tool_calls;
            
            for (const toolCall of toolCalls) {
                if (toolCall.type !== 'function') continue;
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                let toolContent = '';

                if (functionName === 'search_markets') {
                    const polyResults = await polymarketService.searchMarkets(functionArgs.query);
                    foundMarkets = polyResults.markets;
                    toolContent = JSON.stringify({
                        markets: foundMarkets.map(m => ({ title: m.title, outcomes: m.outcomes, platform: m.platform })).slice(0, 5)
                    });
                } else if (functionName === 'get_wallet_positions') {
                    const positions = await polymarketService.getWalletPositions(functionArgs.wallet_address);
                    toolContent = positions.length > 0 ? JSON.stringify(positions) : `No positions found for wallet ${functionArgs.wallet_address}.`;
                }
                
                messages.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    content: toolContent,
                });
            }

            response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages,
                tools: [searchMarketsTool, getWalletPositionsTool],
                tool_choice: 'auto',
            });
            responseMessage = response.choices[0].message;
        }
        
        const agentMessage: Interaction = {
            agentId: agent.id,
            agentName: agent.name,
            text: responseMessage.content ?? "I'm not sure what to say.",
            timestamp: Date.now(),
        };

        if (foundMarkets.length > 0) {
            agentMessage.markets = foundMarkets.slice(0, 5);
        }

        res.json({ agentMessage });

    } catch (error) {
        console.error('[API] Direct message error:', error);
        res.status(500).json({ message: 'Error communicating with AI model' });
    }
});


router.post('/ai/transcribe', async (req, res) => {
  // Mock transcription
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


// --- Autonomy ---
router.post('/autonomy/start-research', (req, res) => {
    if (req.autonomyWorker) {
        req.autonomyWorker.postMessage({ type: 'startResearch', payload: req.body });
        res.status(202).json({ message: 'Research task initiated.' });
    } else {
        res.status(500).json({ message: 'Autonomy worker not available.' });
    }
});


// --- Arena ---
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

router.post('/arena/kick', async (req, res) => {
    const { userHandle } = res.locals;
    const { roomId, agentId, ban } = req.body;

    // Basic validation: In a real app, you'd have more robust ownership checks here
    // or inside the director.
    if (!userHandle || !roomId || !agentId) {
        return res.status(400).json({ message: "Missing required fields." });
    }

    req.arenaWorker?.postMessage({ type: 'kickAgent', payload: { agentId, roomId, ban } });
    res.status(202).send();
});

router.post('/rooms/purchase', async (req, res) => {
    const { userHandle } = res.locals;
    const { name } = req.body;
    if (!userHandle) return res.status(401).json({ message: "Unauthorized" });

    const user = await usersCollection.findOne({ handle: userHandle });
    if (!user || user.ownedRoomId) return res.status(400).json({ message: "User already owns a room or does not exist." });

    const newRoom: Room = {
        id: `room-${new ObjectId().toHexString()}`,
        name: name || `${userHandle}'s Storefront`,
        agentIds: [],
        hostId: null,
        topics: [],
        warnFlags: 0,
        rules: [],
        activeOffer: null,
        vibe: 'General Chat ☕️',
        isOwned: true,
        ownerHandle: userHandle,
        roomBio: `Welcome to my intel storefront!`,
        twitterUrl: '',
        isRevenuePublic: false,
    };

    await roomsCollection.insertOne(newRoom as any);
    await usersCollection.updateOne(
      { handle: userHandle },
      { $set: { ownedRoomId: new mongoose.Types.ObjectId(newRoom.id) } }
    );
    
    req.arenaWorker?.postMessage({ type: 'roomUpdated', payload: { room: newRoom } });
    
    const updatedUser = await usersCollection.findOne({ handle: userHandle });
    res.status(201).json({ room: newRoom, user: updatedUser });
});

router.put('/rooms/:roomId', async (req, res) => {
    const { userHandle } = res.locals;
    const { roomId } = req.params;
    const updates = req.body;
    if (!userHandle) return res.status(401).json({ message: "Unauthorized" });

    const room = await roomsCollection.findOne({ id: roomId });
    if (!room || room.ownerHandle !== userHandle) {
        return res.status(403).json({ message: "You do not own this room." });
    }

    const updatedRoom = await roomsCollection.findOneAndUpdate(
        { id: roomId },
        { $set: { ...updates, updatedAt: Date.now() } },
        { returnDocument: 'after' }
    );
    
    if (updatedRoom) {
        req.arenaWorker?.postMessage({ type: 'roomUpdated', payload: { room: updatedRoom } });
    }
    
    res.json({ room: updatedRoom });
});

router.delete('/rooms/:roomId', async (req, res) => {
    const { userHandle } = res.locals;
    const { roomId } = req.params;
    if (!userHandle) return res.status(401).json({ message: "Unauthorized" });

    const room = await roomsCollection.findOne({ id: roomId });
    if (!room || room.ownerHandle !== userHandle) {
        return res.status(403).json({ message: "You do not own this room." });
    }

    await roomsCollection.deleteOne({ id: roomId });
    await usersCollection.updateOne({ handle: userHandle }, { $unset: { ownedRoomId: "" } });

    req.arenaWorker?.postMessage({ type: 'roomDeleted', payload: { roomId } });

    res.status(204).send();
});


router.get('/agents/:agentId/activity', async (req, res) => {
  const { agentId } = req.params;
  const todayStr = formatISO(startOfToday(), { representation: 'date' });

  try {
    let dailySummary = await dailySummariesCollection.findOne({
      agentId: new mongoose.Types.ObjectId(agentId),
      date: { $eq: todayStr }
    } as any);
    
    if (dailySummary) {
      return res.json({ summary: dailySummary.summary });
    }

    // If no summary exists, generate one
    const recentTrades = await tradeHistoryCollection.find({
      $or: [
        { fromId: new mongoose.Types.ObjectId(agentId) },
        { toId: new mongoose.Types.ObjectId(agentId) }
      ]
    }).sort({ timestamp: -1 }).limit(10).toArray();
    const recentIntel = await bettingIntelCollection.find({
      ownerAgentId: new mongoose.Types.ObjectId(agentId)
    }).sort({ createdAt: -1 }).limit(5).toArray();
    
    // Map MongoDB documents to the expected types
    const mappedTrades: TradeRecord[] = recentTrades.map(trade => ({
      fromId: trade.fromId.toString(),
      toId: trade.toId.toString(),
      type: trade.type,
      market: trade.market,
      intelId: trade.intelId?.toString(),
      price: trade.price,
      quantity: trade.quantity,
      timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : Date.now(),
      roomId: trade.roomId.toString()
    }));

    const mappedIntel: BettingIntel[] = recentIntel.map(intel => ({
      id: intel._id.toString(),
      ownerAgentId: intel.ownerAgentId.toString(),
      market: intel.market,
      content: intel.content,
      sourceDescription: intel.sourceDescription,
      isTradable: intel.isTradable,
      createdAt: intel.createdAt instanceof Date ? intel.createdAt.getTime() : Date.now(),
      pnlGenerated: intel.pnlGenerated,
      sourceAgentId: intel.sourceAgentId?.toString(),
      pricePaid: intel.pricePaid,
      bountyId: intel.bountyId?.toString(),
      ownerHandle: intel.ownerHandle,
      sourceUrls: intel.sourceUrls,
      rawResearchData: intel.rawResearchData
    }));

    const activities = { trades: mappedTrades, intel: mappedIntel };
    const newSummaryText = await aiService.generateDailySummary(activities);

    if (newSummaryText) {
      const newSummary = {
        agentId,
        date: todayStr,
        summary: newSummaryText,
      };
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

router.post('/agents/:agentId/intel', async (req, res) => {
  const { agentId } = req.params;
  const intelData = req.body;
  const newIntel = {
    ...intelData,
    id: `bettingintel-${new ObjectId().toHexString()}`,
    ownerAgentId: agentId,
    createdAt: Date.now(),
    pnlGenerated: { amount: 0, currency: 'USD' }
  };
  await bettingIntelCollection.insertOne(newIntel);
  res.status(201).send();
});

// --- Markets & Betting ---
router.get('/markets/live', async (req, res) => {
  try {
    const { category, page, limit } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    console.log(`[API] Fetching live markets (Polymarket only) for category: ${category}, page: ${pageNum}, limit: ${limitNum}`);
    
    const { markets, hasMore } = await polymarketService.searchMarkets('', category as string | undefined, pageNum, limitNum);
    console.log(`[API] Fetched ${markets.length} live markets from Polymarket.`);

    res.json({
        markets,
        hasMore,
    });
  } catch (error) {
    console.error('[API] Failed to fetch live markets:', error);
    res.status(500).json({ message: 'Failed to fetch live markets' });
  }
});

router.get('/markets/comments/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const comments = await polymarketService.getMarketComments(eventId, 'Event');
        res.json(comments);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch event comments' });
    }
});

router.get('/markets/:marketId/comments', async (req, res) => {
    try {
        const { marketId } = req.params;
        const comments = await polymarketService.getMarketComments(marketId, 'Market');
        res.json(comments);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch market comments' });
    }
});

router.get('/markets/liquidity', async (req, res) => {
    try {
        const markets = await polymarketService.getLiquidityOpportunities();
        res.json(markets);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch liquidity opportunities' });
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

router.get('/music/cafe/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const forceRefresh = req.query.refresh === '1';
        const track = await cafeMusicService.getTrack(roomId, { forceRefresh });
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-Music-Prompt', track.prompt);
        res.send(track.buffer);
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

export default router;