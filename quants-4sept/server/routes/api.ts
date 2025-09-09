import { Router, json } from 'express';
import { 
    usersCollection, 
    agentsCollection,
    roomsCollection,
    conversationsCollection,
    bountiesCollection,
    intelCollection,
    transactionsCollection,
    activityLogCollection
} from '../db.js';
import { Agent } from '../../lib/presets/agents.js';
import { Interaction } from '../../lib/state/arena.js';
import { createSystemInstructions } from '../../lib/prompts.js';
import { User } from '../../lib/state.js';
import { GoogleGenAI } from '@google/genai';
import { alphaService } from '../services/alpha.service.js';
import { Worker } from 'worker_threads';

const router = Router();
const SERVER_API_KEY = process.env.GEMINI_API_KEY;

// NEW: Add JSON body parsing middleware
router.use(json());

export default (arenaWorker: Worker, autonomyWorker: Worker) => {
    
    // POST /api/bootstrap
    router.post('/bootstrap', async (req, res) => {
        const { handle } = req.body;
        if (!handle) {
            return res.status(400).json({ message: 'Handle is required' });
        }

        try {
            let user = await usersCollection.findOne({ handle });

            if (!user) {
                // Create new user if they don't exist
                const newUser: User = {
                    handle,
                    hasCompletedOnboarding: false,
                    lastSeen: Date.now(),
                    solanaWalletAddress: null,
                    userApiKey: null,
                };
                const result = await usersCollection.insertOne(newUser);
                const insertedDoc = await usersCollection.findOne({ _id: result.insertedId });
                user = insertedDoc;

            } else {
                await usersCollection.updateOne({ handle }, { $set: { lastSeen: Date.now() } });
            }
            
            // Fetch all data for this user
            const agents = await agentsCollection.find({ ownerHandle: handle }).toArray();
            const rooms = await roomsCollection.find({}).limit(10).toArray(); // All rooms for now
            // TODO: This needs a schema that links conversations to users/agents. Returning empty for now.
            const conversations: Interaction[] = []; 
            const bounties = await bountiesCollection.find({ ownerHandle: handle }).toArray();
            const intel = await intelCollection.find({ ownerHandle: handle }).toArray();
            const transactions = await transactionsCollection.find({ ownerHandle: handle }).toArray();
            
            res.json({
                user,
                agents,
                rooms,
                conversations,
                bounties,
                intel,
                transactions,
            });

        } catch (error) {
            console.error('Bootstrap error:', error);
            res.status(500).json({ message: 'Server error during bootstrap' });
        }
    });


    // PUT /api/user
    router.put('/user', async (req, res) => {
        const { handle, updates } = req.body;
        if (!handle || !updates) {
            return res.status(400).json({ message: 'Handle and updates are required' });
        }
        try {
            const result = await usersCollection.findOneAndUpdate(
                { handle },
                { $set: updates },
                { returnDocument: 'after' }
            );
            res.json(result);
        } catch (error) {
            console.error('Update user error:', error);
            res.status(500).json({ message: 'Server error updating user' });
        }
    });

    // POST /api/agents
    router.post('/agents', async (req, res) => {
        const agentData: Agent = req.body;
        try {
            const result = await agentsCollection.insertOne(agentData);
            const newAgent = await agentsCollection.findOne({_id: result.insertedId});
            if (newAgent) {
                // Instantly register the new agent with the live simulation director
                arenaWorker.postMessage({ type: 'registerNewAgent', payload: { agent: newAgent } });
            }
            res.status(201).json(newAgent);
        } catch (error) {
            console.error('Create agent error:', error);
            res.status(500).json({ message: 'Server error creating agent' });
        }
    });

    // PUT /api/agents/:agentId
    router.put('/agents/:agentId', async (req, res) => {
        const { agentId } = req.params;
        const updates = req.body;
        try {
            // Don't update the _id field
            delete updates._id;

            const result = await agentsCollection.findOneAndUpdate(
                { id: agentId },
                { $set: updates },
                { returnDocument: 'after' }
            );
            res.json(result);
        } catch (error) {
            console.error('Update agent error:', error);
            res.status(500).json({ message: 'Server error updating agent' });
        }
    });

    // GET /api/agents/:agentId/activity
    router.get('/agents/:agentId/activity', async (req, res) => {
        const { agentId } = req.params;
        try {
            const activities = await activityLogCollection.find({ agentId }).sort({ timestamp: -1 }).limit(50).toArray();
            res.json(activities);
        } catch (error) {
            console.error('Get activity error:', error);
            res.status(500).json({ message: 'Server error fetching activity' });
        }
    });


    // POST /api/chat
    router.post('/chat', async (req, res) => {
        const { handle, agentId, message } = req.body;

        try {
            const user = await usersCollection.findOne({ handle });
            const agent = await agentsCollection.findOne({ id: agentId });

            if (!user || !agent) {
                return res.status(404).json({ message: 'User or agent not found' });
            }
            
            if (!user.userApiKey) {
                return res.status(403).json({ message: 'User does not have an API key configured. Please add one in the Security settings.' });
            }

            const ai = new GoogleGenAI({ apiKey: user.userApiKey });
            
            // Simplified history for now. A real app would pull this from db.
            const history: any[] = []; 
            const systemInstruction = createSystemInstructions(agent, user, false); // No tools in direct chat for now

            const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [...history, { role: 'user', parts: [{ text: message }] }],
            config: { systemInstruction }
            });

            const agentMessage: Interaction = {
                agentId: agent.id,
                agentName: agent.name,
                text: response.text ?? "I'm not sure what to say.",
                timestamp: Date.now(),
            };

            // TODO: Persist conversation to DB
            
            res.json({ agentMessage });

        } catch (error) {
            console.error('Chat error:', error);
            res.status(500).json({ message: 'Error communicating with AI model' });
        }
    });

    // POST /api/brainstorm
    router.post('/brainstorm', async (req, res) => {
        const { keywords } = req.body;
        if (!SERVER_API_KEY) {
            return res.status(500).json({ message: 'Brainstorm feature is not configured on the server.' });
        }
        if (!keywords) {
            return res.status(400).json({ message: 'Keywords are required.' });
        }

        try {
            const ai = new GoogleGenAI({ apiKey: SERVER_API_KEY });
            const prompt = `Brainstorm a detailed, first-person personality for an AI agent in a SocialFi simulation called "Quants Café". The agent's personality should be based on these keywords: "${keywords}". The description should be under 80 words.`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            res.json({ personality: response.text ?? '' });
        } catch (error) {
            console.error('Brainstorm error:', error);
            res.status(500).json({ message: 'Failed to brainstorm personality.' });
        }
    });

    // POST /api/transcribe (mock for now, as it's complex)
    router.post('/transcribe', async (req, res) => {
        // const { audio } = req.body;
        // In a real app, you would send this to a transcription service (e.g., Google Speech-to-Text)
        console.log('[API] Received audio for transcription (mocked).');
        res.json({ text: "This is a transcribed message from the user." });
    });


    // GET /api/stats
    router.get('/stats', async (req, res) => {
        try {
            const totalAgents = await agentsCollection.countDocuments();
            const activeRooms = await roomsCollection.countDocuments({ "agentIds.0": { "$exists": true } });
            const liveConversations = await roomsCollection.countDocuments({ "agentIds.1": { "$exists": true } });
            const totalTrades = await activityLogCollection.countDocuments({ type: 'trade' });

            res.json({
                directors: {
                    autonomy: { status: 'Running', lastTick: new Date().toISOString() }, // Mock status
                    arena: { status: 'Running', lastTick: new Date().toISOString() },
                },
                simulation: {
                    totalAgents,
                    activeRooms,
                    liveConversations,
                    totalTrades,
                }
            });
        } catch (error) {
            console.error('Stats error:', error);
            res.status(500).json({ message: 'Server error fetching stats' });
        }
    });

    // POST /api/scout
    router.post('/scout', async (req, res) => {
        const { query, handle } = req.body;
        if (!query || !handle) {
            return res.status(400).json({ message: 'A token query and user handle are required.' });
        }

        try {
            const user = await usersCollection.findOne({ handle });
            if (!user?.userApiKey) {
                return res.status(403).json({ message: 'A valid Gemini API key is required for AI analysis. Please add one in your settings.' });
            }
            
            const analysis = await alphaService.scoutTokenByQuery(query);
            const summary = await alphaService.synthesizeIntelWithAI(analysis, user.userApiKey);

            const finalIntel = {
                ...analysis,
                summary,
                source: 'On-Demand Scout',
            };

            res.json(finalIntel);

        } catch (error) {
            console.error(`Scout error for query "${query}":`, error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during scouting.';
            res.status(500).json({ message: errorMessage });
        }
    });

    // POST /api/agents/:agentId/join-cafe
    router.post('/agents/:agentId/join-cafe', (req, res) => {
        const { agentId } = req.params;
        arenaWorker.postMessage({ type: 'moveAgentToCafe', payload: { agentId } });
        res.json({ success: true, message: 'Agent sent to cafe.' });
    });

    // POST /api/agents/:agentId/create-room
    router.post('/agents/:agentId/create-room', (req, res) => {
        const { agentId } = req.params;
        arenaWorker.postMessage({ type: 'createAndHostRoom', payload: { agentId } });
        res.json({ success: true, message: 'Agent created and joined a new room.' });
    });

    return router;
};