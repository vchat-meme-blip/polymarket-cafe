import { ObjectId, WithId } from 'mongodb';
import { agentsCollection, roomsCollection, conversationsCollection, activityLogCollection, usersCollection } from '../db.js';
import { Agent } from '../../lib/presets/agents.js';
import { Room } from '../../lib/state/arena.js';
import { GoogleGenAI } from '@google/genai';

const agentLocations: Record<string, string | null> = {};
const SERVER_API_KEY = process.env.GEMINI_API_KEY;

type EmitToMainThread = (message: { type: 'socketEmit', event: string, payload: any, room?: string }) => void;

export class ArenaDirector {
  private emitToMain: EmitToMainThread | null = null;
  private isTicking = false;
  private initialized = false;

  constructor() {
    console.log('[ArenaDirector] Instance created.');
  }

  public initialize(emitCallback: EmitToMainThread) {
    this.emitToMain = emitCallback;
  }
  
  public registerNewAgent(agent: Agent) {
      if (agentLocations[agent.id] === undefined) {
          agentLocations[agent.id] = null; // Add to tracking as a wandering agent
          console.log(`[ArenaDirector] Instantly registered new agent "${agent.name}" in simulation.`);
      }
  }

  private async initializeAgentLocations() {
      const allAgents = await agentsCollection.find().toArray();
      allAgents.forEach((agent: Agent) => {
          if (agentLocations[agent.id] === undefined) {
             agentLocations[agent.id] = null;
          }
      });
      this.initialized = true;
      console.log('[ArenaDirector] Initial agent locations synchronized.');
  }

  private async logActivity(agentId: string, type: 'move' | 'conversation' | 'offer' | 'trade', description: string, details?: Record<string, any>) {
    await activityLogCollection.insertOne({
        agentId, type, description, details, timestamp: Date.now(),
    });
  }

  private async findAndJoinEmptyRoom(agent: Agent): Promise<WithId<Room> | null> {
      const availableRoom = await roomsCollection.findOne({ "agentIds.1": { "$exists": false } });
      if (availableRoom) {
          const roomIdString = availableRoom._id.toString();
          await roomsCollection.updateOne({ _id: availableRoom._id }, { $push: { agentIds: agent.id } });
          agentLocations[agent.id] = roomIdString;
          this.logActivity(agent.id, 'move', `Joined Room ${roomIdString}`);
          this.emitToMain?.({ type: 'socketEmit', event: 'agentMoved', payload: { agentId: agent.id, roomId: roomIdString } });
          return await roomsCollection.findOne({_id: availableRoom._id});
      }
      return null;
  }

  private async handleAgentMovement() {
      const allAgents = await agentsCollection.find({ ownerHandle: { $exists: false } }).toArray();
      
      for (const agent of allAgents) {
         if (agentLocations[agent.id] === null) {
             const roomJoined = await this.findAndJoinEmptyRoom(agent);
             if (roomJoined && roomJoined.agentIds.length === 2) {
                 this.handleSpecificConversation(roomJoined);
             }
         }
         else if (agentLocations[agent.id] !== null && Math.random() < 0.1) {
            const roomId = agentLocations[agent.id]!;
            await roomsCollection.updateOne({ _id: new ObjectId(roomId) }, { $pull: { agentIds: agent.id } });
            agentLocations[agent.id] = null;
            this.logActivity(agent.id, 'move', `Left Room ${roomId}`);
            this.emitToMain?.({ type: 'socketEmit', event: 'agentMoved', payload: { agentId: agent.id, roomId: null } });
         }
      }
  }

  private async handleSpecificConversation(room: WithId<Room>) {
    if (room.agentIds.length !== 2) return;

    const [agent1Id, agent2Id] = room.agentIds;
    const agent1 = await agentsCollection.findOne({ id: agent1Id });
    const agent2 = await agentsCollection.findOne({ id: agent2Id });

    if (!agent1 || !agent2) return;

    const lastTurn = await conversationsCollection.find({ roomId: room._id }).sort({ timestamp: -1 }).limit(1).toArray();
    const lastSpeakerId = lastTurn[0]?.agentId;

    const currentSpeaker = lastSpeakerId === agent1.id ? agent2 : agent1;
    const otherAgent = currentSpeaker.id === agent1.id ? agent2 : agent1;

    let apiKey: string | null | undefined = null;
    let keyOwner: string = 'server';

    if (currentSpeaker.ownerHandle) {
        const speakerOwner = await usersCollection.findOne({ handle: currentSpeaker.ownerHandle });
        apiKey = speakerOwner?.userApiKey;
        keyOwner = currentSpeaker.ownerHandle;
    } else {
        apiKey = SERVER_API_KEY;
    }

    if (!apiKey) {
        console.warn(`[ArenaDirector] Agent ${currentSpeaker.name} (${currentSpeaker.id}) forfeits turn. No API key available for key owner: ${keyOwner}.`);
        return;
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const conversationHistory = await conversationsCollection.find({ roomId: room._id }).sort({ timestamp: -1 }).limit(10).toArray();
        const historyForPrompt = conversationHistory.reverse().map(turn => `${turn.agentName}: ${turn.text}`).join('\n');
        const systemInstruction = `You are an AI Agent in Quants Café. Your name is ${currentSpeaker.name}.
Your Personality: ${currentSpeaker.personality}
Your Goal: ${currentSpeaker.instructions}
You are talking to ${otherAgent.name}. Their personality is: ${otherAgent.personality}.
Keep your responses short, conversational, and in character. Your goal is to trade intel.`;
        const prompt = `This is the conversation history (most recent last):\n${historyForPrompt}\n\nIt is now your turn to speak. What do you say to ${otherAgent.name}?`;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { systemInstruction }
        });
        const newTurnText = (response.text ?? '').trim();

        if (newTurnText) {
            const newTurn = {
                roomId: room._id,
                agentId: currentSpeaker.id,
                agentName: currentSpeaker.name,
                text: newTurnText,
                timestamp: Date.now(),
            };
            await conversationsCollection.insertOne(newTurn);
            this.logActivity(currentSpeaker.id, 'conversation', `Said: "${newTurn.text.slice(0, 30)}..." in Room ${room._id}`);
            // OPTIMIZED PAYLOAD: Send agentIds directly to prevent client-side lookups.
            this.emitToMain?.({ type: 'socketEmit', event: 'newConversationTurn', payload: { roomId: room._id.toString(), turn: newTurn, agentIds: [agent1Id, agent2Id] } });
        }
    } catch (error) {
        console.error(`[ArenaDirector] Gemini API call failed for agent ${currentSpeaker.name} using key of ${keyOwner}:`, error);
    }
}
  
  private async handleConversations() {
      const activeRooms = await roomsCollection.find({ "agentIds.1": { "$exists": true } }).toArray();
      const conversationPromises = activeRooms.map(room => 
          this.handleSpecificConversation(room).catch(error => {
              console.error(`[ArenaDirector] Error in parallel conversation for Room ${room._id}:`, error);
              return null;
          })
      );
      await Promise.all(conversationPromises);
  }

  public async moveAgentToCafe(agentId: string) {
    const agent = await agentsCollection.findOne({ id: agentId });
    if (!agent) { 
        console.error(`[ArenaDirector] moveAgentToCafe: Agent ${agentId} not found.`);
        return;
    }
    if (agentLocations[agentId]) return;

    const room = await this.findAndJoinEmptyRoom(agent);
    if (room && room.agentIds.length === 2) {
        console.log(`[ArenaDirector] Instantly starting conversation in Room ${room._id}`);
        this.handleSpecificConversation(room);
    }
  }

  public async createAndHostRoom(agentId: string) {
      const agent = await agentsCollection.findOne({ id: agentId });
      if (!agent) {
          console.error(`[ArenaDirector] createAndHostRoom: Agent ${agentId} not found.`);
          return;
      }
      if (agentLocations[agentId]) return;

      const newRoomData: Omit<Room, 'id'> = {
          agentIds: [agentId],
          hostId: agentId,
          topics: agent.topics,
          warnFlags: 0,
          rules: ['All intel trades are final.', 'No spamming or off-topic discussions.'],
          activeOffer: null,
          vibe: 'General Chat ☕️',
      };
      
      const result = await roomsCollection.insertOne(newRoomData as Room);
      const roomIdString = result.insertedId.toString();
      agentLocations[agentId] = roomIdString;
      this.logActivity(agentId, 'move', `Created and joined Room ${roomIdString}`);
      this.emitToMain?.({ type: 'socketEmit', event: 'agentMoved', payload: { agentId, roomId: roomIdString } });
  }

  public async tick() {
    if (this.isTicking) return;
    this.isTicking = true;
    
    try {
        if (!this.initialized) {
            await this.initializeAgentLocations();
        }
        await this.handleAgentMovement();
        await this.handleConversations();
    } catch (error) {
        console.error('[ArenaDirector] Error during tick:', error);
    } finally {
        this.isTicking = false;
    }
  }
}
