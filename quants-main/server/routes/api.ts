import { Router } from 'express';
import Joi from 'joi';
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
import { Agent, Interaction, User } from '../../lib/types/index.js';
import { createSystemInstructions } from '../../lib/prompts.js';
import OpenAI from 'openai';
import { alphaService } from '../services/alpha.service.js';
import { Worker } from 'worker_threads';
import { apiKeyService } from '../services/apiKey.service.js';
import { elevenLabsService } from '../services/elevenlabs.service.js';
import { cafeMusicService } from '../services/cafeMusic.service.js';

const router = Router();

// Helper function to get activity summary, used by both summary and chat endpoints
async function getAgentActivitySummary(agentId: string, apiKey: string) {
    const agent = await agentsCollection.findOne({ id: agentId });
    if (!agent) throw new Error('Agent not found');

    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    const logs = await activityLogCollection.find({ agentId, timestamp: { $gte: twentyFourHoursAgo } }).sort({ timestamp: -1 }).toArray();

    const stats = {
        trades: logs.filter(l => l.type === 'trade').length,
        intelDiscovered: logs.filter(l => l.type === 'intel_discovery').length,
        conversations: new Set(logs.filter(l => l.type === 'conversation').map(l => l.details?.roomId)).size,
    };

    const prompt = `You are the AI agent named ${agent.name}. Your personality is: "${agent.personality}".
Write a short, first-person "End of Day" report summarizing your activity. Be concise and in-character.
Use markdown for simple formatting (e.g., ### Heading, - list item).

Your activity stats from the last 24 hours:
- Trades completed: ${stats.trades}
- New intel discovered: ${stats.intelDiscovered}
- Conversations held in: ${stats.conversations} different rooms

Based on the raw logs, create a narrative summary. Mention key trades or intel if they stand out.
Raw logs: ${JSON.stringify(logs.slice(0, 10))}

Write the summary now.`;

    const client = new OpenAI({ apiKey });
    const completion = await client.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: prompt,
    });

    const summary = completion.output_text?.trim() ?? '';
    return { summary, logs, stats };
}


export default (arenaWorker: Worker, autonomyWorker: Worker) => {
    
    // POST /api/user/check-handle
    router.post('/user/check-handle', async (req, res) => {
        const { handle } = req.body;
        if (!handle) {
            return res.status(400).json({ message: 'Handle is required' });
        }
        const existingUser = await usersCollection.findOne({ handle });
        res.json({ 
            available: !existingUser,
            isNewUser: !existingUser
        });
    });

    router.get('/tts-voices', (req, res) => {
        if (!elevenLabsService.isConfigured()) {
            return res.status(503).json({ error: 'TTS service not configured on the server.' });
        }

        res.json(elevenLabsService.getAvailableVoices());
    });

    router.post('/tts', async (req, res) => {
        if (!elevenLabsService.isConfigured()) {
            return res.status(503).json({ error: 'TTS service not configured on the server.' });
        }

        const { text, voiceId, modelId } = req.body || {};

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text is required.' });
        }

        try {
            const stream = await elevenLabsService.synthesizeSpeech({ text, voiceId, modelId });
            const reader = stream.getReader();

            res.setHeader('Content-Type', 'audio/mpeg');

            const pump = async (): Promise<void> => {
                const { done, value } = await reader.read();
                if (done) {
                    res.end();
                    return;
                }
                if (value) {
                    res.write(Buffer.from(value));
                }
                await pump();
            };

            await pump();
        } catch (error: any) {
            console.error('[API][TTS] ElevenLabs synthesis failed:', error);
            res.status(500).json({ error: 'Failed to synthesize speech', details: error?.message });
        }
    });

    router.get('/music/cafe/:roomId', async (req, res) => {
        if (!elevenLabsService.isConfigured()) {
            return res.status(503).json({ error: 'Music service not configured on the server.' });
        }

        const { roomId } = req.params;
        if (!roomId) {
            return res.status(400).json({ error: 'Room ID is required.' });
        }

        const forceRefresh = req.query.refresh === '1';

        try {
            const track = await cafeMusicService.getTrack(roomId, { forceRefresh });
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Length', track.buffer.length);
            res.setHeader('Cache-Control', 'private, max-age=120');
            res.setHeader('X-Music-Prompt', track.prompt);
            res.send(track.buffer);
        } catch (error: any) {
            console.error('[API][CafeMusic] Failed to load cafe track:', error);
            res.status(500).json({ error: 'Failed to generate cafe music track', details: error?.message });
        }
    });

    router.post('/music/compose', async (req, res) => {
        if (!elevenLabsService.isConfigured()) {
            return res.status(503).json({ error: 'Music service not configured on the server.' });
        }

        const { prompt, musicLengthMs } = req.body || {};

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return res.status(400).json({ error: 'A music prompt is required.' });
        }

        try {
            const stream = await elevenLabsService.composeMusic({ prompt, musicLengthMs });
            const reader = stream.getReader();

            res.setHeader('Content-Type', 'audio/mpeg');

            const pump = async (): Promise<void> => {
                const { done, value } = await reader.read();
                if (done) {
                    res.end();
                    return;
                }
                if (value) {
                    res.write(Buffer.from(value));
                }
                await pump();
            };

            await pump();
        } catch (error: any) {
            console.error('[API][Music] ElevenLabs compose failed:', error);
            res.status(500).json({ error: 'Failed to generate music', details: error?.message });
        }
    });

    // POST /api/user/register
    router.post('/user/register', async (req, res) => {
        console.log('[API][Register] Registration request received:', { 
            body: req.body,
            ip: req.ip,
            headers: req.headers
        });
        
        try {
            const { handle, name = '' } = req.body;
            
            if (!handle) {
                console.error('[API][Register] Error: Handle is required');
                return res.status(400).json({ message: 'Handle is required' });
            }

            // Check if handle already exists
            console.log(`[API][Register] Checking if handle exists: ${handle}`);
            const existingUser = await usersCollection.findOne({ handle });
            
            if (existingUser) {
                console.error(`[API][Register] Error: Handle '${handle}' is already taken`);
                return res.status(400).json({ message: 'Handle is already taken' });
            }

            // Create new user with timestamps as numbers
            const timestamp = Date.now();
            const newUser: User = {
                handle,
                name,
                info: '',
                hasCompletedOnboarding: false,
                lastSeen: timestamp,
                solanaWalletAddress: null,
                userApiKey: null,
                createdAt: timestamp,
                updatedAt: timestamp
            };

            console.log('[API][Register] Creating new user:', JSON.stringify(newUser, null, 2));
            const result = await usersCollection.insertOne(newUser);
            
            if (!result.acknowledged || !result.insertedId) {
                throw new Error('Failed to insert user into database');
            }
            
            console.log(`[API][Register] Successfully registered user: ${handle} with ID: ${result.insertedId}`);
            
            // Return the user data without sensitive information
            const { userApiKey, ...userWithoutKey } = newUser as any;
            const userResponse = { ...userWithoutKey, _id: result.insertedId };
            
            res.status(201).json({ 
                success: true, 
                user: userResponse 
            });
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during registration';
            console.error('[API][Register] Registration error:', errorMessage, error);
            res.status(500).json({ 
                success: false, 
                message: 'Registration failed',
                error: errorMessage 
            });
        }
    });

    // POST /api/user/recover-by-wallet
    router.post('/user/recover-by-wallet', async (req, res) => {
        const { walletAddress } = req.body;
        if (!walletAddress) {
            return res.status(400).json({ message: 'Wallet address is required' });
        }
        const user = await usersCollection.findOne({ solanaWalletAddress: walletAddress });
        if (user) {
            res.json({ handle: user.handle });
        } else {
            res.status(404).json({ message: 'No account found for this wallet address.' });
        }
    });

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
                    name: '',
                    info: '',
                    hasCompletedOnboarding: false,
                    lastSeen: Date.now(),
                    solanaWalletAddress: null,
                    userApiKey: null,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                const result = await usersCollection.insertOne(newUser);
                const insertedDoc = await usersCollection.findOne({ _id: result.insertedId });
                user = insertedDoc;

            } else {
                await usersCollection.updateOne({ handle }, { $set: { lastSeen: Date.now() } });
            }
            
            // Fetch all data for this user
            const agents = await agentsCollection.find({ ownerHandle: handle }).toArray();
            const rooms = await roomsCollection.find({}, { projection: { _id: 0 } }).limit(20).toArray(); 
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
                { $set: { ...updates, updatedAt: Date.now() } },
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
        const agentSchema = Joi.object({
            id: Joi.string().required(),
            name: Joi.string().required(),
            personality: Joi.string().required(),
            instructions: Joi.string().required(),
            voice: Joi.string().required(),
            topics: Joi.array().items(Joi.string()).required(),
            wishlist: Joi.array().items(Joi.string()).required(),
            reputation: Joi.number().required(),
            ownerHandle: Joi.string().required(),
            isShilling: Joi.boolean().required(),
            shillInstructions: Joi.string().required(),
            modelUrl: Joi.string().required(),
            templateId: Joi.string().optional(),
            boxBalance: Joi.number().required(),
            portfolio: Joi.object().required(),
        });

        const { error, value: agentData } = agentSchema.validate(req.body);

        if (error) {
            return res.status(400).json({ message: `Validation error: ${error.details.map(d => d.message).join(', ')}` });
        }
        try {
            const result = await agentsCollection.insertOne(agentData);
            const newAgent = await agentsCollection.findOne({ _id: result.insertedId });

            // Remove the internal MongoDB _id before sending to the client
            if (newAgent) {
                delete (newAgent as any)._id;
            }

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
        
        const updateSchema = Joi.object({
            name: Joi.string(),
            personality: Joi.string(),
            instructions: Joi.string(),
            voice: Joi.string(),
            topics: Joi.array().items(Joi.string()),
            wishlist: Joi.array().items(Joi.string()),
            reputation: Joi.number(),
            isShilling: Joi.boolean(),
            shillInstructions: Joi.string(),
            modelUrl: Joi.string(),
            boxBalance: Joi.number(),
            portfolio: Joi.object(),
            // Allow empty updates
        });

        const { error, value: updates } = updateSchema.validate(req.body);

        if (error) {
            return res.status(400).json({ message: `Validation error: ${error.details.map(d => d.message).join(', ')}` });
        }
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

    // GET /api/agents/:agentId/activity-summary
    router.get('/agents/:agentId/activity-summary', async (req, res) => {
        const { agentId } = req.params;
        try {
            const apiKey = await apiKeyService.getKeyForAgent(agentId);
            if (!apiKey) return res.status(403).json({ message: 'No API key available for summary generation.' });
            
            const summaryData = await getAgentActivitySummary(agentId, apiKey);
            res.json(summaryData);

        } catch (error) {
            console.error(`Activity summary error for agent ${agentId}:`, error);
            const errorMessage = error instanceof Error ? error.message : 'Server error generating activity summary';
            res.status(500).json({ message: errorMessage });
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
            
            const apiKey = await apiKeyService.getKeyForAgent(agentId);
            if (!apiKey) {
                return res.status(403).json({ message: 'User does not have an API key configured. Please add one in the Security settings.' });
            }

            const { summary } = await getAgentActivitySummary(agentId, apiKey);
            const activityContext = `Here is your "End of Day" report. Use this information to answer any questions the user has about your recent activity:\n${summary}`;

            const systemInstruction = createSystemInstructions(agent, user, false) + `\n\n---INTERNAL MEMORY---\n${activityContext}`;

            const client = new OpenAI({ apiKey });
            const chatResponse = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: message }
                ],
                temperature: 0.8,
            });

            const assistantMessage = chatResponse.choices[0]?.message?.content ?? "I'm not sure what to say.";

            const agentMessage: Interaction = {
                agentId: agent.id,
                agentName: agent.name,
                text: assistantMessage,
                timestamp: Date.now(),
            };

            res.json({ agentMessage });

        } catch (error) {
            console.error('Chat error:', error);
            res.status(500).json({ message: 'Error communicating with AI model' });
        }
    });

    // POST /api/brainstorm
    router.post('/brainstorm', async (req, res) => {
        const { keywords } = req.body;
        const apiKey = process.env.OPENAI_BRAINSTORM_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ message: 'Brainstorm feature is not configured on the server.' });
        }
        if (!keywords) {
            return res.status(400).json({ message: 'Keywords are required.' });
        }

        try {
            const client = new OpenAI({ apiKey });
            const prompt = `Brainstorm a detailed, first-person personality for an AI agent in a SocialFi simulation called "Quants Café". The agent's personality should be based on these keywords: "${keywords}". The description should be under 80 words.`;
            const completion = await client.responses.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                input: prompt,
            });

            const personality = completion.output_text?.trim() ?? '';
            res.json({ personality });
        } catch (error) {
            console.error('Brainstorm error:', error);
            res.status(500).json({ message: 'Failed to brainstorm personality.' });
        }
    });

    // POST /api/transcribe (mock for now, as it's complex)
    router.post('/transcribe', async (req, res) => {
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
            const apiKey = user?.userApiKey || process.env.GEMINI_API_KEY;
            if (!apiKey) {
                return res.status(403).json({ message: 'A valid Gemini API key is required for AI analysis. Please add one in your settings.' });
            }
            
            const analysis = await alphaService.scoutTokenByQuery(query);
            const summary = await alphaService.synthesizeIntelWithAI(analysis, apiKey);

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

    // POST /api/agents/:agentId/start-research
    router.post('/agents/:agentId/start-research', (req, res) => {
        const { agentId } = req.params;
        const { handle } = req.body; // User handle for targeted feedback
        
        autonomyWorker.postMessage({ type: 'researchForAgent', payload: { agentId } });
        
        // Provide immediate feedback to the user who requested it
        if (handle) {
            arenaWorker.postMessage({ type: 'socketEmit', event: 'systemMessage', room: handle, payload: { type: 'system', message: `Research task initiated for agent.` } });
        }

        res.json({ success: true, message: 'Agent research task initiated.' });
    });

    // POST /api/agents/:agentId/create-room
    router.post('/agents/:agentId/create-room', (req, res) => {
        const { agentId } = req.params;
        arenaWorker.postMessage({ type: 'createAndHostRoom', payload: { agentId } });
        res.json({ success: true, message: 'Agent created and joined a new room.' });
    });

    // TTS Proxy Route
    router.get('/tts', async (req, res) => {
        const { text, voice } = req.query;
        if (!text || typeof text !== 'string') {
            return res.status(400).send('Missing text parameter');
        }

        const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${voice || 'en-US'}&client=tw-ob`;

        try {
            const proxyRes = await fetch(googleTtsUrl, {
                headers: { 'User-Agent': 'stagefright/1.2 (Linux;Android 5.0)' }
            });

            if (!proxyRes.ok) {
                throw new Error(`Failed to fetch TTS audio: ${proxyRes.statusText}`);
            }

            res.writeHead(proxyRes.status, Object.fromEntries(proxyRes.headers.entries()));
            proxyRes.body?.pipeTo(new WritableStream({
                write(chunk) {
                    res.write(chunk);
                },
                close() {
                    res.end();
                }
            }));
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error(`[TTS Proxy] Error: ${message}`);
            res.status(500).send('Failed to fetch TTS audio');
        }
    });


    return router;
};