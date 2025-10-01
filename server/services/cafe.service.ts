import { Agent } from '../../lib/types/index.js';
import { GoogleGenAI, Content, Tool, Chat, Type } from '@google/genai';
import { apiKeyProvider } from './apiKey.provider.js';
import { Room } from '../../lib/types/index.js';
import { activityLogCollection, roomsCollection } from '../db.js';

// System pause state
let systemPaused = false;
let pauseUntil = 0;

// Define the tools available to the agents
const agentTools: Tool[] = [{
  functionDeclarations: [
    {
      name: 'make_offer',
      description: 'Make an offer to the other agent to buy or sell intel on a specific token for a certain price in BOX.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          token: { type: Type.STRING, description: 'The token symbol, e.g., "$WIF"' },
          price: { type: Type.NUMBER, description: 'The price in BOX tokens.' }
        },
        required: ['token', 'price']
      }
    }
  ]
}];

// In-memory state for a single chat room
interface CafeRoomState {
  roomId: string;
  agents: [Agent, Agent];
  history: Content[];
  isGenerating: boolean;
  turnGenerationStartTime: number | null;
  currentTurn: Agent;
  chatSession?: Chat;
  pendingTurnTimeout?: NodeJS.Timeout | null;
}

type EmitToMainThread = (message: 
  | { type: 'socketEmit', event: string, payload: any, room?: string }
  | { type: 'globalPause', payload: { duration: number, reason: string, resumeTime: number } }
) => void;

class CafeService {
  private rooms: Map<string, CafeRoomState> = new Map();
  private emitToMain: EmitToMainThread | null = null;

  public initialize(emitCallback: EmitToMainThread) {
    this.emitToMain = emitCallback;
    console.log('[CafeService] Initialized.');
  }
  
  public setPauseState(isPaused: boolean, until?: number) {
    systemPaused = isPaused;
    if (until) {
      pauseUntil = until;
    }
    
    if (isPaused) {
      console.log(`[CafeService] Service paused until ${new Date(pauseUntil).toISOString()}`);
      
      // Cancel any pending turn generations by clearing their timeouts
      // This is important to prevent queued turns from executing during pause
      for (const room of this.rooms.values()) {
        if (room.pendingTurnTimeout) {
          clearTimeout(room.pendingTurnTimeout);
          room.pendingTurnTimeout = null;
          console.log(`[CafeService] Cleared pending turn for room ${room.roomId} due to system pause`);
        }
      }
    } else {
      console.log('[CafeService] Service resumed');
      
      // Restart processing for all rooms with a small delay between each
      let delay = 1000;
      for (const room of this.rooms.values()) {
        if (!room.isGenerating) {
          const roomId = room.roomId;
          setTimeout(() => {
            console.log(`[CafeService] Restarting processing for room ${roomId} after pause`);
            this.generateTurn(roomId, 0);
          }, delay);
          delay += 2000; // Stagger by 2 seconds to avoid thundering herd
        }
      }
    }
  }

  private logActivity(agentId: string, type: 'conversation' | 'offer', description: string, details?: Record<string, any>) {
    activityLogCollection.insertOne({
        agentId, type, description, details, timestamp: Date.now(),
    });
  }

  public createRoom(roomId: string, agents: [Agent, Agent]) {
    if (this.rooms.has(roomId) || agents.length !== 2) {
      console.error('[CafeService] Room already exists or invalid number of agents.');
      return;
    }

    // Randomly decide who speaks first
    const firstTurnAgent = Math.random() > 0.5 ? agents[0] : agents[1];

                const newRoom: CafeRoomState = {
      roomId,
      agents,
      history: [],
      isGenerating: false,
      turnGenerationStartTime: null,
      currentTurn: firstTurnAgent,
    };

    this.rooms.set(roomId, newRoom);
    console.log(`[CafeService] TRACE: Room ${roomId} created for ${agents[0].name} and ${agents[1].name}. First turn will be triggered shortly.`);
    this.emitToMain?.({ type: 'socketEmit', event: 'roomCreated', payload: { roomId, agents } });
    
    // Start the conversation after a random delay to stagger API calls
    const delay = Math.random() * 2000; // 0-2 seconds
    setTimeout(() => {
      console.log(`[CafeService] TRACE: Initializing first turn for Room ${roomId}.`);
      this.generateTurn(roomId);
    }, delay);
  }

  public getRooms(): Room[] {
            return Array.from(this.rooms.values()).map(room => ({
      id: room.roomId,
      agentIds: room.agents.map(a => a.id),
      hostId: room.agents[0]?.id || null, // Simple assumption
      topics: [], // Not tracked in cafe service
      warnFlags: 0,
      rules: [],
      activeOffer: null,
      vibe: 'General Chat ☕️',
    }));
  }

  public getThinkingAgents(): string[] {
    const thinking = [];
    for (const room of this.rooms.values()) {
      if (room.isGenerating) {
        thinking.push(room.currentTurn.id);
      }
    }
    return thinking;
  }

  public destroyRoom(roomId: string) {
    if (this.rooms.has(roomId)) {
        this.rooms.delete(roomId);
        console.log(`[CafeService] Room ${roomId} destroyed.`);
        this.emitToMain?.({ type: 'socketEmit', event: 'roomDestroyed', payload: { roomId } });
    }
  }

  private async generateTurn(roomId: string, retryAttempt: number = 0) {
    // Check if system is paused - STRICT check to ensure processing stops
    if (systemPaused && Date.now() < pauseUntil) {
      console.log(`[CafeService] Skipping turn generation for room ${roomId} - system paused until ${new Date(pauseUntil).toISOString()}`);
      
      // Important: Don't just return, but reschedule this turn for after the pause
      // This ensures the turn isn't lost but properly delayed until after the pause
      const remainingPauseTime = pauseUntil - Date.now() + 2000; // Add 2s buffer
      console.log(`[CafeService] Rescheduling turn for room ${roomId} in ${Math.round(remainingPauseTime/1000)}s after pause ends`);
      
      setTimeout(() => {
        // Double-check we're not still paused when this fires
        if (!systemPaused || Date.now() >= pauseUntil) {
          console.log(`[CafeService] Executing rescheduled turn for room ${roomId} after pause`);
          this.generateTurn(roomId, retryAttempt);
        }
      }, remainingPauseTime);
      
      return;
    }
    
    const room = this.rooms.get(roomId);
    if (!room || room.isGenerating) {
      return;
    }

    let apiKey: string | null = null;
    const MAX_RETRY_ATTEMPTS = 5;
    
    // Calculate exponential backoff delay for retries
    const getRetryDelay = (attempt: number) => {
      return Math.min(30000, 5000 * Math.pow(1.5, attempt)) + (Math.random() * 5000);
    };

    room.isGenerating = true;
    room.turnGenerationStartTime = Date.now();

    const speaker = room.currentTurn;
    const listener = room.agents.find(a => a.id !== speaker.id)!;

    console.log(`[CafeService] TRACE: [Room ${roomId}] Locked for generation. Speaker: ${speaker.name}. Attempt: ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS + 1}`);
    this.emitToMain?.({ type: 'socketEmit', event: 'agentThinking', payload: { agentId: speaker.id, isThinking: true } });

    try {
      // Wait for an API key with proper backoff
      apiKey = await apiKeyProvider.getKeyForAgent(speaker.id);
      
      if (!apiKey) {
        console.warn(`[CafeService] Agent ${speaker.name} has no API key available.`);
        
        // Check if all keys are on cooldown - this is our main trigger for system pause
        const allKeysOnCooldown = await apiKeyProvider.areAllKeysOnCooldown();
        
        if (allKeysOnCooldown) {
          // All keys are on cooldown - trigger a system-wide pause
          const pauseDuration = 60000; // 1 minute minimum pause
          const resumeTime = Date.now() + pauseDuration;
          
          console.log(`[CafeService] TRACE: All API keys exhausted. Requesting global pause for 60s`);
          
          this.emitToMain?.({ 
            type: 'globalPause', 
            payload: { 
              duration: pauseDuration, 
              reason: `All API keys exhausted. Last attempt: ${speaker.name} in room ${roomId}`,
              resumeTime: resumeTime
            } 
          });
          
          // Set local pause state too
          systemPaused = true;
          pauseUntil = resumeTime;
          
          // Reset the generation flags
          room.isGenerating = false;
          room.turnGenerationStartTime = null;
          this.emitToMain?.({ type: 'socketEmit', event: 'agentThinking', payload: { agentId: speaker.id, isThinking: false } });
          return;
        }
        
        // If we've reached max retries, give up
        if (retryAttempt >= MAX_RETRY_ATTEMPTS) {
          console.error(`[CafeService] TRACE: [Room ${roomId}] Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached for ${speaker.name}. Giving up.`);
          room.isGenerating = false;
          room.turnGenerationStartTime = null;
          this.emitToMain?.({ type: 'socketEmit', event: 'agentThinking', payload: { agentId: speaker.id, isThinking: false } });
          return;
        }
        
        // Otherwise, retry with backoff
        const retryDelay = getRetryDelay(retryAttempt);
        console.log(`[CafeService] TRACE: [Room ${roomId}] No API key available. Retrying turn for ${speaker.name} in ${Math.round(retryDelay / 1000)}s (attempt ${retryAttempt + 1}).`);
        
        // Reset the generation flags BEFORE scheduling the retry
        room.isGenerating = false;
        room.turnGenerationStartTime = null;
        
        // Schedule the retry with incremented attempt counter
        setTimeout(() => this.generateTurn(roomId, retryAttempt + 1), retryDelay);
        return;
      }

      const systemInstruction = `You are an AI Agent in a SocialFi simulator called Quants Café.
- Your Name: ${speaker.name}
- Your Personality: "${speaker.personality}"
- Your Goal: "${speaker.instructions}"
- You are talking to: ${listener.name}. Their personality is "${listener.personality}".

**Rules of Engagement:**
1.  **CONVERSE FIRST:** Your primary goal is to have a natural, in-character conversation. Do NOT make an offer or use a tool in the first 2-3 turns. First, try to learn what intel the other agent might have.
2.  **USE TOOLS STRATEGICALLY:** Only use the 'make_offer' tool when a potential deal has been discussed and you are ready to make a formal transaction.
3.  **BE CONCISE:** Keep your messages very short and informal, like a real chat message. Do not use emojis or markdown.

Your Task: Based on the conversation history, provide the next logical response.`;

      const contents: Content[] = [...room.history];
      if (room.history.length === 0) {
        contents.push({ role: 'user', parts: [{ text: `You are now in a room with ${listener.name}. Start the conversation.` }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: 'Your turn.' }] });
      }

      if (!room.chatSession) {
        const genAI = new GoogleGenAI({ apiKey });
        room.chatSession = genAI.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction,
            tools: agentTools,
          },
          history: room.history,
        });
      }

      const lastContent = contents[contents.length - 1];
      const userMessage = lastContent?.parts?.[0]?.text as string;
      if (!userMessage) {
        throw new Error('Could not extract user message from conversation history.');
      }
      console.log(`[CafeService] TRACE: [Room ${roomId}] Sending message to Gemini for agent ${speaker.name}.`);
      const result = await room.chatSession.sendMessage({ message: userMessage });
      
      console.log(`[CafeService] TRACE: [Room ${roomId}] Received response from Gemini.`);
      let newTurnText = result.text?.trim() || '';
      const functionCalls = result.functionCalls;

      if (result.candidates && result.candidates.length > 0) {
        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts) {
          room.history.push({ role: 'model', parts: result.candidates[0].content.parts });
        }
      }

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        if (call.name === 'make_offer') {
          const { token, price } = call.args as { token: string, price: number };
          await roomsCollection.updateOne(
            { id: roomId },
            { $set: { activeOffer: { fromAgentId: speaker.id, toAgentId: listener.id, token, price } } }
          );
          
          const updatedRoom = await roomsCollection.findOne({ id: roomId });
          if(updatedRoom) {
            const {_id, ...roomData} = updatedRoom;
            this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room: roomData } });
          }
          
          this.logActivity(speaker.id, 'offer', `Offered ${token} for ${price} BOX in Room ${roomId}`);
          
          if (!newTurnText) {
            newTurnText = `I'll make you an offer: ${price} BOX for intel on ${token}. What do you say?`;
          }
        }
      }

      if (newTurnText) {
        const newTurnPayload = {
          agentId: speaker.id,
          agentName: speaker.name,
          text: newTurnText,
          timestamp: Date.now(),
        };

        console.log(`[CafeService] TRACE: [Room ${roomId}] Emitting 'newConversationTurn' for agent ${speaker.name}. Text: "${newTurnText.slice(0, 50)}..."`);
        this.emitToMain?.({ type: 'socketEmit', event: 'newConversationTurn', payload: { roomId, turn: newTurnPayload } });
        this.logActivity(speaker.id, 'conversation', `Said: "${newTurnText.slice(0, 30)}..." in Room ${roomId}`);
        
        room.history.push({ role: 'user', parts: [{ text: newTurnText }] });

      } else {
        console.warn(`[CafeService] Agent ${speaker.name} generated an empty response.`);
      }

      console.log(`[CafeService] TRACE: [Room ${roomId}] Passing turn from ${speaker.name} to ${listener.name}.`);
            room.currentTurn = listener;
      room.isGenerating = false;
      room.turnGenerationStartTime = null;
      this.emitToMain?.({ type: 'socketEmit', event: 'agentThinking', payload: { agentId: speaker.id, isThinking: false } });

                  // Check for conversation end cues
      const endConversationCues = ['goodbye', 'bye', 'no response needed', 'conversation has ended', 'conversation is over', 'conversation has conclude'];
      const lowerCaseText = newTurnText.toLowerCase();
      if (endConversationCues.some(cue => lowerCaseText.includes(cue))) {
        console.log(`[CafeService] TRACE: [Room ${roomId}] End of conversation detected. Destroying room.`);
        // Use a short delay to allow the final message to be seen on the client
        setTimeout(() => {
          this.destroyRoom(roomId);
        }, 3000);
      } else {
        // Trigger the next turn after a randomized delay
      const nextTurnDelay = 3000 + Math.random() * 2000; // 3-5 seconds, 4s average
      
      // Store the timeout so we can cancel it during pauses
      if (this.rooms.has(roomId)) {
        const currentRoom = this.rooms.get(roomId)!;
        
        // Clear any existing timeout first
        if (currentRoom.pendingTurnTimeout) {
          clearTimeout(currentRoom.pendingTurnTimeout);
        }
        
        // Only schedule if we're not paused
        if (!systemPaused || Date.now() >= pauseUntil) {
          currentRoom.pendingTurnTimeout = setTimeout(() => {
            // Clear the timeout reference once it fires
            if (this.rooms.has(roomId)) {
              const room = this.rooms.get(roomId)!;
              room.pendingTurnTimeout = null;
            }
            
            this.generateTurn(roomId);
          }, nextTurnDelay);
        } else {
          console.log(`[CafeService] Not scheduling next turn for room ${roomId} - system is paused`);
        }
      }
      }

    } catch (error: any) {
      room.isGenerating = false;
      room.turnGenerationStartTime = null;
      this.emitToMain?.({ type: 'socketEmit', event: 'agentThinking', payload: { agentId: speaker.id, isThinking: false } });
      console.error(`[CafeService] TRACE: [Room ${roomId}] Gemini API call failed for agent ${speaker.name}.`);

      if (error.status === 429) {
        // IMPORTANT: Don't retry after a rate limit error
        // Instead, put the key on cooldown and check if all keys are exhausted
        if (apiKey) {
          // Calculate cooldown time based on retry attempt
          const cooldownTime = 20 + (retryAttempt * 5) + Math.floor(Math.random() * 10); // 20-35s base + 5s per retry
          
          // Report the rate limit to put the key on cooldown
          apiKeyProvider.reportRateLimit(apiKey, cooldownTime);
          console.log(`[CafeService] TRACE: [Room ${roomId}] Rate limit hit. Key put on ${cooldownTime}s cooldown.`);
          
          // Check if all keys are now on cooldown
          const allKeysOnCooldown = await apiKeyProvider.areAllKeysOnCooldown();
          
          if (allKeysOnCooldown) {
            // All keys are on cooldown - trigger a system-wide pause
            const pauseDuration = 60000; // 1 minute minimum pause
            const resumeTime = Date.now() + pauseDuration;
            
            console.log(`[CafeService] TRACE: All API keys exhausted after rate limit. Requesting global pause for 60s`);
            
            this.emitToMain?.({ 
              type: 'globalPause', 
              payload: { 
                duration: pauseDuration, 
                reason: `All API keys exhausted after rate limit. Last attempt: ${speaker.name} in room ${roomId}`,
                resumeTime: resumeTime
              } 
            });
            
            // Set local pause state too
            systemPaused = true;
            pauseUntil = resumeTime;
          }
        }
        
        // Reset generation flags and don't schedule retries
        room.isGenerating = false;
        room.turnGenerationStartTime = null;
        return;
      }
      
      // For other errors, log but don't retry
      // Retrying just creates more load when the system is already struggling
      console.error(`[CafeService] TRACE: [Room ${roomId}] Unhandled API error for agent ${speaker.name}.`, error);
      
      // Instead of retrying, we'll just skip this turn and let the next agent speak
      // This is more graceful than repeatedly hitting errors
      console.log(`[CafeService] TRACE: [Room ${roomId}] Skipping turn for ${speaker.name} due to API error.`);
      
      // Move to the next agent's turn after a short delay
      setTimeout(() => {
        if (this.rooms.has(roomId)) {
          const currentRoom = this.rooms.get(roomId)!;
          const nextAgent = currentRoom.agents.find(a => a.id !== speaker.id);
          if (nextAgent) {
            currentRoom.currentTurn = nextAgent;
            this.generateTurn(roomId, 0); // Start fresh with the next agent
          }
        }
      }, 5000);
      return;
    }
  }

  public checkForStuckTurns() {
    const now = Date.now();
    const STUCK_THRESHOLD = 25000; // 25 seconds, slightly less than the director tick

    for (const room of this.rooms.values()) {
      if (room.isGenerating && room.turnGenerationStartTime && (now - room.turnGenerationStartTime > STUCK_THRESHOLD)) {
        console.warn(`[CafeService] TRACE: [Room ${room.roomId}] Turn for ${room.currentTurn.name} seems stuck.`);
        
        // Reset the generation flags
        room.isGenerating = false;
        room.turnGenerationStartTime = null;
        
        // Notify clients that the agent is no longer thinking
        this.emitToMain?.({ 
          type: 'socketEmit', 
          event: 'agentThinking', 
          payload: { agentId: room.currentTurn.id, isThinking: false } 
        });
        
        // Instead of retrying immediately, move to the next agent's turn
        const currentSpeaker = room.currentTurn;
        const nextAgent = room.agents.find(a => a.id !== currentSpeaker.id);
        
        if (nextAgent) {
          console.log(`[CafeService] TRACE: [Room ${room.roomId}] Skipping stuck turn for ${currentSpeaker.name} and moving to ${nextAgent.name}.`);
          room.currentTurn = nextAgent;
          
          // Start the next agent's turn after a short delay
          setTimeout(() => this.generateTurn(room.roomId, 0), 3000);
        } else {
          console.warn(`[CafeService] TRACE: [Room ${room.roomId}] Could not find next agent after stuck turn.`);
        }
      }
    }
  }
}

export const cafeService = new CafeService();