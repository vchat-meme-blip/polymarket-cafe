import { Agent } from '../../lib/types/index.js';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/index';
import { apiKeyProvider } from './apiKey.provider.js';
import { Room } from '../../lib/types/index.js';
import { activityLogCollection, agentsCollection, roomsCollection } from '../db.js';

// Simple tokenizer fallback for topic extraction
const simpleTokenizer = (text: string): string[] => {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !/^\d+$/.test(word));
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeAgentOutput = (agentName: string, rawText: string): string => {
  if (!rawText) return '';

  let text = rawText.trim();
  if (!text) return '';

  const escapedName = escapeRegex(agentName.trim());

  const bracketPattern = new RegExp(`^(\\s*\\[${escapedName}\\]\\s*)+`, 'i');
  text = text.replace(bracketPattern, '').trimStart();

  const labelPattern = new RegExp(`^(?:${escapedName}\\s*[:\\-]\\s*)+`, 'i');
  text = text.replace(labelPattern, '').trimStart();

  text = text.replace(/\s{2,}/g, ' ');

  return text.trim();
};

// Function to extract topics from text
function extractTopics(text: string): string[] {
  if (!text) return [];
  
  // Extract token symbols first (e.g., $BTC, $ETH)
  const tokenSymbols = text.match(/\$[A-Za-z0-9]+/g) || [];
  
  // Use simple tokenizer as fallback
  const tokens = simpleTokenizer(text);
  
  // Simple stop words filter
  const stopWords = ['the', 'and', 'but', 'or', 'a', 'an', 'in', 'on', 'at', 'to', 'for'];
  const filtered = tokens.filter(token => !stopWords.includes(token));
  
  // Combine and dedupe
  const allTopics = [...new Set([...filtered, ...tokenSymbols])];
  
  return allTopics.slice(0, 3); // Return top 3 topics max
}

// System pause state
let systemPaused = false;
let pauseUntil = 0;

// Define the tools available to the agents
const agentTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'propose_intel_offer',
      description:
        'Make an offer to the other agent to buy or sell intel on a specific token for a certain price in BOX.',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'The token symbol, e.g., "$WIF"'
          },
          price: {
            type: 'number',
            description: 'The price in BOX tokens.'
          }
        },
        required: ['token', 'price']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_token_trade',
      description:
        'Propose a trade to buy or sell a specific quantity of a token at a set price per token.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['BUY', 'SELL'],
            description:
              'Whether you are proposing to BUY a token from the other agent or SELL a token to them.'
          },
          token: {
            type: 'string',
            description: 'The token symbol, e.g., "$WIF"'
          },
          quantity: {
            type: 'number',
            description: 'The number of tokens to be traded.'
          },
          price_per_token: {
            type: 'number',
            description: 'The price in BOX for each individual token.'
          }
        },
        required: ['action', 'token', 'quantity', 'price_per_token']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'accept_trade',
      description:
        'Accept the currently active trade offer proposed by the other agent. This will execute the transaction immediately.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reject_trade',
      description: 'Reject the currently active trade offer.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

// In-memory state for a single chat room
interface ChatMessage {
  id: string;           // Unique message ID
  timestamp: number;    // Unix timestamp
  senderId: string;     // ID of the sender (empty for system messages)
  senderName: string;   // Name of the sender (or 'System' for system messages)
  content: string;      // Message content
  type: 'agent' | 'system';
}

const DEFAULT_SPEECH_WORDS_PER_SECOND = 2.2; // ~132 words per minute speaking pace
const POST_SPEECH_BUFFER_MS = 1500;
const MIN_TURN_DELAY_MS = 4500;
const MAX_TURN_DELAY_MS = 20000;
const TURN_JITTER_MIN_MS = 750;
const TURN_JITTER_MAX_MS = 2500;

interface CafeRoomState {
  roomId: string;
  agents: [Agent, Agent];
  messages: ChatMessage[];  // Replaces history
  lastMessageId: number;    // For generating unique message IDs
  isGenerating: boolean;
  turnGenerationStartTime: number | null;
  currentTurn: Agent;
  pendingTurnTimeout?: NodeJS.Timeout | null;
  currentTopic?: string;
  lastTopicChange?: number;
  consecutiveTurnsWithoutProgress?: number;
  client?: OpenAI;
  lastTurnDelayMs?: number;
}

type EmitToMainThread = (message: 
  | { type: 'socketEmit', event: string, payload: any, room?: string }
  | { type: 'globalPause', payload: { duration: number, reason: string, resumeTime: number } }
) => void;

class CafeService {
  private rooms: Map<string, CafeRoomState> = new Map();
  private emitToMain: EmitToMainThread | null = null;
  private conversationEndHandler?: (roomId: string, agentIds: string[]) => void;
  
  // Track conversation topics and their cooldowns
  private topicCooldown = new Map<string, number>();
  private readonly TOPIC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  
  // Update the conversation topic based on message content
  private updateConversationTopic(room: CafeRoomState, message: string) {
    const now = Date.now();
    const topics = extractTopics(message);
    
    // If we found a topic in the message, update the room's topic
    if (topics.length > 0) {
      const newTopic = topics[0]; // Just take the first topic for now
      
      // Check if this topic is in cooldown
      const lastUsed = this.topicCooldown.get(newTopic) || 0;
      if (now - lastUsed > this.TOPIC_COOLDOWN_MS) {
        room.currentTopic = newTopic;
        room.lastTopicChange = now;
        this.topicCooldown.set(newTopic, now);
        console.log(`[CafeService] Updated conversation topic to: ${newTopic}`);
      }
    }
    
    // If the conversation has been on the same topic for too long, force a change
    if (room.currentTopic && room.lastTopicChange && 
        now - room.lastTopicChange > this.TOPIC_COOLDOWN_MS) {
      console.log(`[CafeService] Topic '${room.currentTopic}' is stale, clearing topic`);
      room.currentTopic = undefined;
      room.lastTopicChange = now;
    }
  }

  public initialize(emitCallback: EmitToMainThread) {
    this.emitToMain = emitCallback;
    console.log('[CafeService] Initialized.');
  }

  public onConversationEnded(handler: (roomId: string, agentIds: string[]) => void) {
    this.conversationEndHandler = handler;
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

  private logActivity(agentId: string, type: 'conversation' | 'offer' | 'trade', description: string, details?: Record<string, any>) {
    activityLogCollection.insertOne({
        agentId, type, description, details, timestamp: Date.now(),
    });
  }

  /**
   * Adds a message to the room's message history
   */
  private addMessage(roomId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): string {
    const room = this.rooms.get(roomId);
    if (!room) return '';

    const messageId = `msg_${++room.lastMessageId}`;
    const newMessage: ChatMessage = {
      ...message,
      id: messageId,
      timestamp: Date.now()
    };

    room.messages.push(newMessage);
    
    // Keep only the last 50 messages to prevent memory issues
    if (room.messages.length > 50) {
      room.messages = room.messages.slice(-50);
    }

    return messageId;
  }

  /**
   * Gets recent messages for a room
   */
  private getRecentMessages(roomId: string, limit: number = 10): ChatMessage[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    
    return room.messages.slice(-limit);
  }

  /**
   * Gets conversation context as a formatted string
   */
  private getConversationContext(roomId: string, currentSpeaker: Agent, listener: Agent): string {
    const recentMessages = this.getRecentMessages(roomId, 6); // Get last 6 messages
    const context = recentMessages.map(msg => 
      msg.type === 'system' 
        ? `[System] ${msg.content}`
        : `[${msg.senderName}] ${msg.content}`
    ).join('\n');

    return `Conversation Context:\n${context}\n\n` +
           `It's now ${currentSpeaker.name}'s turn to speak to ${listener.name}. ` +
           `Keep your response concise and relevant to the conversation.`;
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
      messages: [],
      lastMessageId: 0,
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
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`[CafeService] Room ${roomId} not found for destruction.`);
      return;
    }
    
    // Clear any pending timeouts to prevent memory leaks
    if (room.pendingTurnTimeout) {
      clearTimeout(room.pendingTurnTimeout);
      room.pendingTurnTimeout = null;
    }
    
    // Clean up any other resources
    room.client = undefined;

    // Remove the room from the map
    this.rooms.delete(roomId);
    
    console.log(`[CafeService] Room ${roomId} destroyed and cleaned up.`);
    this.emitToMain?.({ 
      type: 'socketEmit', 
      event: 'roomDestroyed', 
      payload: { roomId } 
    });
  }

  private async generateTurn(roomId: string, retryAttempt: number = 0) {
    // Check if system is paused - STRICT check to ensure processing stops
    if (systemPaused && Date.now() < pauseUntil) {
      console.log(`[CafeService] Skipping turn generation for room ${roomId} - system paused until ${new Date(pauseUntil).toISOString()}`);
      
      // Important: Don't just return, but reschedule this turn for after the pause
      // This ensures the turn isn't lost but properly delayed until after the pause
      const remainingPauseTime = pauseUntil - Date.now() + 2000; // Add 2s buffer
      console.log(`[CafeService] Rescheduling turn for room ${roomId} in ${Math.round(remainingPauseTime/1000)}s after pause ends`);
      
      // Clear any existing timeout first
      const room = this.rooms.get(roomId);
      if (room?.pendingTurnTimeout) {
        clearTimeout(room.pendingTurnTimeout);
      }
      
      // Set a new timeout for after the pause
      if (room) {
        room.pendingTurnTimeout = setTimeout(() => {
          // Double-check we're not still paused when this fires
          if (!systemPaused || Date.now() >= pauseUntil) {
            console.log(`[CafeService] Executing rescheduled turn for room ${roomId} after pause`);
            this.generateTurn(roomId, retryAttempt);
          }
        }, remainingPauseTime) as any;
      }
      
      return;
    }
    
    const room = this.rooms.get(roomId);
    if (!room) {
      console.warn(`[CafeService] Room ${roomId} not found`);
      return;
    }
    
    // Prevent concurrent turns
    if (room.isGenerating) {
      console.log(`[CafeService] Room ${roomId} is already generating a turn, skipping...`);
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
- Your current BOX balance: ${(speaker.boxBalance ?? 0).toFixed(2)}
- Your current token portfolio: ${JSON.stringify(speaker.portfolio)}

**Conversation Context:**
- Messages in [square brackets] indicate the speaker
- [System] messages provide context about the conversation state
- Keep track of who said what to maintain natural turn-taking

**Rules of Engagement:**
1. **CONVERSE NATURALLY:** Maintain a natural back-and-forth flow with the other agent.
2. **BE AWARE OF TURNS:** Wait for the other agent to finish before speaking again.
3. **USE TOOLS STRATEGICALLY:**
   - Use 'propose_intel_offer' to make a formal offer for information.
   - Use 'propose_token_trade' to make a formal offer to buy/sell tokens.
   - Use 'accept_trade' ONLY if you agree with an active offer.
   - Use 'reject_trade' to decline an offer you don't want.
4. **BE CONCISE:** Keep messages short and informal, like real chat.

**Current Turn:** It's your turn to speak. Respond naturally to the conversation.`;

      // Get recent messages for context
      let recentMessages = this.getRecentMessages(roomId, 10);

      if (recentMessages.length === 0) {
        // First message in the conversation
        this.addMessage(roomId, {
          senderId: '',
          senderName: 'System',
          content: `You are now in a room with ${listener.name}. Start the conversation.`,
          type: 'system'
        });
        recentMessages = this.getRecentMessages(roomId, 10);
      }

      if (!room.client) {
        room.client = new OpenAI({ apiKey });
      }

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemInstruction
        },
        ...recentMessages.map(msg => {
          if (msg.type === 'system') {
            return {
              role: 'user',
              content: `[System] ${msg.content}`
            } as ChatCompletionMessageParam;
          }
          const role = msg.senderId === speaker.id ? 'assistant' : 'user';
          return {
            role,
            content: `[${msg.senderName}] ${msg.content}`
          } as ChatCompletionMessageParam;
        }),
        {
          role: 'user',
          content:
            recentMessages.length === 0
              ? `You are now in a room with ${listener.name}. Start the conversation.`
              : `Respond naturally to ${listener.name}.`
        }
      ];

      console.log(
        `[CafeService] TRACE: [Room ${roomId}] Sending message to OpenAI for agent ${speaker.name}.`
      );
      const completion = await room.client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        tools: agentTools,
        tool_choice: 'auto',
        max_tokens: 400,
        temperature: 0.8
      });

      const choice = completion.choices[0];
      const responseMessage = choice.message;
      const toolCalls = responseMessage.tool_calls || [];
      let newTurnText = sanitizeAgentOutput(speaker.name, responseMessage.content || '');

      if (newTurnText) {
        this.addMessage(roomId, {
          senderId: speaker.id,
          senderName: speaker.name,
          content: newTurnText,
          type: 'agent'
        });

        this.addMessage(roomId, {
          senderId: '',
          senderName: 'System',
          content: `${speaker.name} has finished speaking. It's now ${listener.name}'s turn.`,
          type: 'system'
        });
      }

      if (toolCalls.length > 0) {
        for (const call of toolCalls) {
          if (call.function.name === 'propose_intel_offer') {
            const args = JSON.parse(call.function.arguments) as { token: string; price: number };
            await roomsCollection.updateOne(
              { id: roomId },
              {
                $set: {
                  activeOffer: {
                    type: 'intel',
                    fromAgentId: speaker.id,
                    toAgentId: listener.id,
                    token: args.token,
                    price: args.price
                  }
                }
              }
            );
            this.logActivity(
              speaker.id,
              'offer',
              `Offered intel on ${args.token} for ${args.price} BOX in Room ${roomId}`
            );
            if (!newTurnText) {
              newTurnText = `I'll make you an offer: ${args.price} BOX for intel on ${args.token}. What do you say?`;
            }
          }

          if (call.function.name === 'propose_token_trade') {
            const args = JSON.parse(call.function.arguments) as {
              action: 'BUY' | 'SELL';
              token: string;
              quantity: number;
              price_per_token: number;
            };
            await roomsCollection.updateOne(
              { id: roomId },
              {
                $set: {
                  activeOffer: {
                    type: 'token',
                    fromAgentId: speaker.id,
                    toAgentId: listener.id,
                    action: args.action,
                    token: args.token,
                    quantity: args.quantity,
                    price_per_token: args.price_per_token
                  }
                }
              }
            );
            this.logActivity(
              speaker.id,
              'offer',
              `Proposed to ${args.action} ${args.quantity} ${args.token} at ${args.price_per_token} BOX each in Room ${roomId}`
            );
            if (!newTurnText) {
              newTurnText = `I'd like to ${args.action.toLowerCase()} ${args.quantity} of your ${args.token} for ${args.price_per_token} BOX each.`;
            }
          }

          if (call.function.name === 'reject_trade') {
            await roomsCollection.updateOne({ id: roomId }, { $set: { activeOffer: null } });
            if (!newTurnText) {
              newTurnText = "No, I'm not interested in that trade.";
            }
          }

          if (call.function.name === 'accept_trade') {
            const roomRecord = await roomsCollection.findOne({ id: roomId });
            const activeOffer = roomRecord?.activeOffer;

            if (!activeOffer) {
              if (!newTurnText) {
                newTurnText = "There's no active offer to accept right now.";
              }
              continue;
            }

            const buyerId = activeOffer.type === 'intel'
              ? activeOffer.toAgentId
              : activeOffer.action === 'SELL'
                ? activeOffer.toAgentId
                : activeOffer.fromAgentId;
            const sellerId = activeOffer.type === 'intel'
              ? activeOffer.fromAgentId
              : activeOffer.action === 'SELL'
                ? activeOffer.fromAgentId
                : activeOffer.toAgentId;

            const buyer = await agentsCollection.findOne({ id: buyerId });
            const seller = await agentsCollection.findOne({ id: sellerId });

            if (!buyer || !seller) {
              console.warn(`[CafeService] Trade settlement aborted; missing buyer or seller for offer in room ${roomId}`);
              await roomsCollection.updateOne({ id: roomId }, { $set: { activeOffer: null } });
              if (!newTurnText) {
                newTurnText = "Trade could not be settled due to missing participant.";
              }
              continue;
            }

            const totalPrice = activeOffer.type === 'intel'
              ? activeOffer.price
              : activeOffer.price_per_token * activeOffer.quantity;

            if (buyer.boxBalance < totalPrice) {
              console.warn(`[CafeService] Buyer ${buyer.name} lacks BOX (${buyer.boxBalance}) for trade price ${totalPrice}.`);
              await roomsCollection.updateOne({ id: roomId }, { $set: { activeOffer: null } });
              if (!newTurnText) {
                newTurnText = "Looks like I don't have enough BOX to complete this trade.";
              }
              continue;
            }

            const buyerUpdate: Record<string, any> = { $inc: { boxBalance: -totalPrice } };
            const sellerUpdate: Record<string, any> = { $inc: { boxBalance: totalPrice } };

            if (activeOffer.type === 'token') {
              const quantity = activeOffer.quantity;
              const token = activeOffer.token;

              if (activeOffer.action === 'SELL') {
                buyerUpdate.$inc[`portfolio.${token}`] = quantity;
                sellerUpdate.$inc[`portfolio.${token}`] = -quantity;
              } else {
                buyerUpdate.$inc[`portfolio.${token}`] = -quantity;
                sellerUpdate.$inc[`portfolio.${token}`] = quantity;
              }
            }

            await Promise.all([
              agentsCollection.updateOne({ id: buyerId }, buyerUpdate),
              agentsCollection.updateOne({ id: sellerId }, sellerUpdate),
              roomsCollection.updateOne({ id: roomId }, { $set: { activeOffer: null } })
            ]);

            const tradeRecord = {
              roomId,
              fromId: sellerId,
              toId: buyerId,
              timestamp: Date.now(),
              ...(activeOffer.type === 'intel'
                ? { type: 'intel' as const, token: activeOffer.token, price: activeOffer.price }
                : {
                    type: 'token' as const,
                    token: activeOffer.token,
                    quantity: activeOffer.quantity,
                    price: activeOffer.price_per_token * activeOffer.quantity
                  })
            };

            this.logActivity(sellerId, 'trade', `Completed trade in room ${roomId}`, { tradeRecord });
            this.logActivity(buyerId, 'trade', `Completed trade in room ${roomId}`, { tradeRecord });

            this.emitToMain?.({
              type: 'socketEmit',
              event: 'tradeExecuted',
              payload: { trade: tradeRecord },
              room: roomId
            });

            if (!newTurnText) {
              if (activeOffer.type === 'intel') {
                newTurnText = `Deal! Sending over the intel on ${activeOffer.token} for ${activeOffer.price} BOX.`;
              } else {
                newTurnText = `Trade complete! ${activeOffer.quantity} ${activeOffer.token} exchanged for ${activeOffer.price_per_token} BOX each.`;
              }
            }
          }
        }
      }
      
      const updatedRoomDb = await roomsCollection.findOne({ id: roomId });
      if (updatedRoomDb) {
        const {_id, ...roomData} = updatedRoomDb;
        this.emitToMain?.({ type: 'socketEmit', event: 'roomUpdated', payload: { room: roomData } });
      }

      if (newTurnText) {
        // Format the message with speaker context
        const formattedMessage = `[${speaker.name}] ${newTurnText}`;
        
        const newTurnPayload = {
          agentId: speaker.id,
          agentName: speaker.name,
          text: newTurnText,
          timestamp: Date.now(),
          formattedText: formattedMessage
        };

        console.log(`[CafeService] TRACE: [Room ${roomId}] Emitting 'newConversationTurn' for agent ${speaker.name}. Text: "${newTurnText.slice(0, 50)}..."`);
        
        const payloadRoom = {
          id: room.roomId,
          agentIds: room.agents.map(a => a.id),
          currentTurn: listener.id
        };
        
        // Emit the turn change to all clients
        this.emitToMain?.({ 
          type: 'socketEmit', 
          event: 'turnChanged', 
          payload: { 
            roomId,
            currentTurn: listener.id,
            previousTurn: speaker.id 
          },
          room: roomId 
        });
        
        // Emit the new message
        this.emitToMain?.({ 
          type: 'socketEmit', 
          event: 'newConversationTurn', 
          payload: { 
            roomId, 
            room: payloadRoom, 
            turn: newTurnPayload 
          } 
        });
        
        this.logActivity(speaker.id, 'conversation', `Said: "${newTurnText.slice(0, 30)}..." in Room ${roomId}`);
        
        // Update the room state to reflect the turn change
        room.isGenerating = false;
        room.turnGenerationStartTime = null;
      } else {
        console.warn(`[CafeService] Agent ${speaker.name} generated an empty response.`);
      }

      // Update the turn to the next agent
      console.log(`[CafeService] TRACE: [Room ${roomId}] Passing turn from ${speaker.name} to ${listener.name}.`);
      
      // Update the room state
      room.isGenerating = false;
      room.turnGenerationStartTime = null;
      
      // Use the centralized turn change handler
      await this.handleTurnChange(roomId, speaker, listener);
      
      // Notify clients that the turn has changed
      this.emitToMain?.({
        type: 'socketEmit',
        event: 'turnChanged',
        payload: {
          roomId,
          currentTurn: listener.id,
          previousTurn: speaker.id
        },
        room: roomId
      });
      
      // Update thinking state for both agents
      this.emitToMain?.({
        type: 'socketEmit',
        event: 'agentThinking',
        payload: { agentId: speaker.id, isThinking: false }
      });
      
      // Log the turn change
      console.log(`[CafeService] Turn passed to ${listener.name} in room ${roomId}`);

                  // Check for conversation end cues
      const endConversationCues = ['goodbye', 'bye', 'no response needed', 'conversation has ended', 'conversation is over', 'conversation has conclude'];
      const lowerCaseText = newTurnText.toLowerCase();
      if (endConversationCues.some(cue => lowerCaseText.includes(cue))) {
        console.log(`[CafeService] TRACE: [Room ${roomId}] End of conversation detected. Destroying room.`);
        const agentsLeaving = room.agents.map(agent => agent.id);
        this.conversationEndHandler?.(roomId, agentsLeaving);
        // Use a short delay to allow the final message to be seen on the client
        setTimeout(() => {
          this.destroyRoom(roomId);
        }, 3000);
      } else {
      // Calculate next turn delay with pacing based on spoken text
      if (!this.rooms.has(roomId)) {
        console.warn(`[CafeService] Room ${roomId} no longer exists, cannot schedule next turn`);
        return;
      }

      const currentRoom = this.rooms.get(roomId)!;
      const nextTurnDelay = this.calculateTurnDelay(newTurnText, currentRoom);

      // Clear any existing timeout to prevent duplicates
      if (currentRoom.pendingTurnTimeout) {
        clearTimeout(currentRoom.pendingTurnTimeout);
        currentRoom.pendingTurnTimeout = null;
      }

      // Only schedule the next turn if we're not paused
      if (systemPaused && Date.now() < pauseUntil) {
        console.log(`[CafeService] Not scheduling next turn for room ${roomId} - system is paused`);
        return;
      }

      console.log(`[CafeService] Scheduling next turn for room ${roomId} in ${Math.round(nextTurnDelay/1000)}s (computed from speech pacing)`);

      // Schedule the next turn
      currentRoom.pendingTurnTimeout = global.setTimeout(() => {
        try {
          // Clear the timeout reference
          if (this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId)!;
            room.pendingTurnTimeout = null;
            
            // Validate the room state before proceeding
            if (!room.currentTurn || !room.agents || room.agents.length !== 2) {
              console.error(`[CafeService] Invalid room state for ${roomId}, cannot continue turn`);
              return;
            }
            
            // Proceed with the next turn
            console.log(`[CafeService] Executing next turn for room ${roomId}`);
            this.generateTurn(roomId);
          }
        } catch (error) {
          console.error(`[CafeService] Error in turn scheduling for room ${roomId}:`, error);
          
          // Try to recover by cleaning up and scheduling a new attempt
          if (this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId)!;
            room.isGenerating = false;
            room.turnGenerationStartTime = null;
            room.pendingTurnTimeout = null;
            
            // Retry after a delay if we haven't exceeded max retries
            if (retryAttempt < 3) {
              const retryDelay = 5000 * (retryAttempt + 1);
              console.log(`[CafeService] Will retry turn for room ${roomId} in ${retryDelay}ms (attempt ${retryAttempt + 1})`);
              room.pendingTurnTimeout = setTimeout(() => {
                this.generateTurn(roomId, retryAttempt + 1);
              }, retryDelay) as any;
            }
          }
        }
      }, nextTurnDelay) as any;
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
      const nextAgent = room.agents.find(a => a.id !== speaker.id);
      if (nextAgent) {
        // Update the room state immediately
        room.currentTurn = nextAgent;
        room.isGenerating = false;
        room.turnGenerationStartTime = null;
        
        // Add system message about the error and turn change
        this.addMessage(room.roomId, {
          senderId: '',
          senderName: 'System',
          content: `${speaker.name} encountered an error. It's now ${nextAgent.name}'s turn.`,
          type: 'system'
        });
        
        // Emit the turn change event
        this.emitToMain?.({
          type: 'socketEmit',
          event: 'turnChanged',
          payload: {
            roomId,
            currentTurn: nextAgent.id,
            previousTurn: speaker.id
          },
          room: roomId
        });
        
        // Start the next agent's turn after a short delay
        setTimeout(() => this.generateTurn(roomId, 0), 3000);
      } else {
        console.warn(`[CafeService] TRACE: [Room ${roomId}] Could not find next agent after error.`);
        room.isGenerating = false;
        room.turnGenerationStartTime = null;
      }
      return;
    }
  }

  private getRetryDelay(attempt: number): number {
    return Math.min(30000, 5000 * Math.pow(1.5, attempt)) + (Math.random() * 5000);
  }

  private calculateTurnDelay(spokenText: string, room: CafeRoomState): number {
    const wordCount = (spokenText?.trim().split(/\s+/).filter(Boolean).length) || 0;
    const spokenDurationMs = (wordCount / DEFAULT_SPEECH_WORDS_PER_SECOND) * 1000;

    const jitter = TURN_JITTER_MIN_MS + Math.random() * (TURN_JITTER_MAX_MS - TURN_JITTER_MIN_MS);
    let delay = spokenDurationMs + POST_SPEECH_BUFFER_MS + jitter;

    // Smooth transitions by blending with previous delay if available
    if (room.lastTurnDelayMs) {
      delay = (delay * 0.65) + (room.lastTurnDelayMs * 0.35);
    }

    const clampedDelay = Math.min(Math.max(delay, MIN_TURN_DELAY_MS), MAX_TURN_DELAY_MS);
    room.lastTurnDelayMs = clampedDelay;
    return clampedDelay;
  }

  /**
   * Handles the transition of turns between agents
   * @param roomId - The ID of the room where the turn is changing
   * @param previousSpeaker - The agent who just finished speaking
   * @param nextSpeaker - The agent whose turn it is now
   * @param systemMessage - Optional custom system message
   */
  private async handleTurnChange(
    roomId: string, 
    previousSpeaker: Agent, 
    nextSpeaker: Agent, 
    systemMessage?: string
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.warn(`[CafeService] Room ${roomId} not found during turn change`);
      return;
    }

    // Update the current turn
    room.currentTurn = nextSpeaker;
    
    // Add system message about turn change
    const message = systemMessage || 
      `${previousSpeaker.name} has finished speaking. It's now ${nextSpeaker.name}'s turn.`;
    
    // Add the message using our new system
    this.addMessage(roomId, {
      senderId: '',
      senderName: 'System',
      content: message,
      type: 'system'
    });

    // Emit turn change event
    this.emitToMain?.({
      type: 'socketEmit',
      event: 'turnChanged',
      payload: {
        roomId,
        currentTurn: nextSpeaker.id,
        previousTurn: previousSpeaker.id
      },
      room: roomId
    });

    // Log the turn change
    console.log(`[CafeService] Turn changed in room ${roomId} from ${previousSpeaker.name} to ${nextSpeaker.name}`);
  }

  public async checkForStuckTurns(): Promise<void> {
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
        
        // Move to the next agent's turn using the centralized handler
        const currentSpeaker = room.currentTurn;
        const nextAgent = room.agents.find(a => a.id !== currentSpeaker.id);
        
        if (nextAgent) {
          console.log(`[CafeService] TRACE: [Room ${room.roomId}] Skipping stuck turn for ${currentSpeaker.name} and moving to ${nextAgent.name}.`);
          
          // Update the current turn immediately to prevent race conditions
          const previousSpeaker = room.currentTurn;
          room.currentTurn = nextAgent;
          room.isGenerating = false;
          room.turnGenerationStartTime = null;
          
          // Add system message about the timeout
          this.addMessage(room.roomId, {
            senderId: '',
            senderName: 'System',
            content: `${previousSpeaker.name}'s turn timed out. It's now ${nextAgent.name}'s turn.`,
            type: 'system'
          });
          
          // Emit the turn change event
          this.emitToMain?.({
            type: 'socketEmit',
            event: 'turnChanged',
            payload: {
              roomId: room.roomId,
              currentTurn: nextAgent.id,
              previousTurn: previousSpeaker.id
            },
            room: room.roomId
          });
          
          // Start the next agent's turn after a short delay
          setTimeout(() => this.generateTurn(room.roomId, 0), 3000);
        } else {
          console.warn(`[CafeService] TRACE: [Room ${room.roomId}] Could not find next agent after stuck turn.`);
          
          // If no next agent, just reset the generation state
          room.isGenerating = false;
          room.turnGenerationStartTime = null;
        }
      }
    }
  }
}

export const cafeService = new CafeService();