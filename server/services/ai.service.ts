/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import OpenAI from 'openai';
import mongoose from 'mongoose';
const { Types } = mongoose;

import { Agent, Interaction, MarketIntel, Room, TradeRecord, BettingIntel, User, AgentTask } from '../../lib/types/index.js';
import { apiKeyProvider } from './apiKey.provider.js';
import { creditService } from './credit.service.js';
import { agentsCollection, bettingIntelCollection, notificationsCollection, usersCollection, newMarketsCacheCollection } from '../db.js';
import { polymarketService } from './polymarket.service.js';
import { kalshiService } from './kalshi.service.js';
import { firecrawlService } from './firecrawl.service.js';
import { createSystemInstructions } from '../../lib/prompts.js';

// Define the tools available to the agent
const agentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'search_markets',
            description: 'Search for prediction markets on Polymarket based on a query or category.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query, e.g., "Trump".' },
                    category: { type: 'string', description: 'A specific category to filter by, e.g., "Sports".' },
                    order: { type: 'string', description: "Sort order. Use 'id' for most recent, 'volume' for highest volume.", enum: ['id', 'volume'] },
                },
                required: ['query'],
            },
        },
    },
     {
        type: 'function',
        function: {
            name: 'get_market_details',
            description: "Get detailed, real-time information (including exact odds, volume, liquidity) for a specific market using its full ID.",
            parameters: {
                type: 'object',
                properties: {
                    market_id: { type: 'string', description: "The full market ID, e.g., 'polymarket-514079'." },
                },
                required: ['market_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'propose_bet',
            description: "Propose a single, actionable bet to the user. This will display a formal bet slip in the user's UI.",
            parameters: {
                type: 'object',
                properties: {
                    marketId: { type: 'string', description: 'The unique ID of the market for the bet.' },
                    outcome: { type: 'string', description: "The outcome to bet on, typically 'Yes' or 'No'." },
                    amount: { type: 'number', description: 'The suggested bet amount in USD.' },
                    price: { type: 'number', description: 'The odds for the suggested outcome (from 0 to 1).' },
                    analysis: { type: 'string', description: 'Your detailed reasoning for this bet suggestion. This will be shown to the user.' },
                    sourceIntelId: { type: 'string', description: 'The ID of the intel from your knowledge base that influenced this decision, if any.' },
                },
                required: ['marketId', 'outcome', 'amount', 'price', 'analysis'],
            },
        }
    },
    {
        type: 'function',
        function: {
            name: 'research_web',
            description: 'Perform a live web search for real-time information on any topic, such as news, financial data, or events.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query for the web search.' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_market_comments',
            description: "Analyze public sentiment by reading the latest comments on a specific Polymarket market.",
            parameters: {
                type: 'object',
                properties: {
                    market_id: { type: 'string', description: "The Polymarket market ID, which is the numeric part of the full ID (e.g., '514079' from 'polymarket-514079')." },
                },
                required: ['market_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_trader_positions',
            description: "Research the portfolio of top traders to see their recent activity. Use their full wallet address.",
            parameters: {
                type: 'object',
                properties: {
                    trader_address: { type: 'string', description: "The full wallet address (e.g., '0x...') of the trader to look up." },
                },
                required: ['trader_address'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_my_tasks',
            description: "Review your own list of currently assigned tasks and their status to inform your user.",
            parameters: { type: 'object', properties: {} }
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_intel_by_id',
            description: "Retrieve a specific piece of intel from your memory bank using its unique ID.",
            parameters: {
                type: 'object',
                properties: {
                    intel_id: { type: 'string', description: "The unique ID of the intel asset to retrieve." },
                },
                required: ['intel_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'gesture',
            description: 'Perform a physical gesture or animation to add expression to your message. Use this sparingly to emphasize a point or show emotion.',
            parameters: {
                type: 'object',
                properties: {
                    animation_name: { 
                        type: 'string', 
                        description: 'The name of the gesture to perform.',
                        enum: ['cute', 'dance', 'elegant', 'greeting', 'peacesign', 'pose', 'shoot', 'spin', 'squat']
                    },
                },
                required: ['animation_name'],
            },
        },
    }
];


class AiService {
  private async retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    let apiKey: string | null = null;
    try {
        return await fn();
    } catch (error) {
        if (error instanceof OpenAI.APIError && error.status === 429 && retries > 1) {
            console.warn(`[AiService] Rate limit hit. Retrying in ${delay / 1000}s...`);
            if (apiKey) {
              apiKeyProvider.reportRateLimit(apiKey, 60); // Report rate limit before retry
            }
            await new Promise(res => setTimeout(res, delay));
            return this.retry<T>(fn, retries - 1, delay * 2);
        }
        throw error;
    }
  }

  // FIX: Implement the missing `brainstormPersonality` method in the `AiService` class to handle requests from the frontend for generating AI agent personalities.
  async brainstormPersonality(keywords: string): Promise<{ personality: string }> {
    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent('system-brainstorm');
      if (!apiKey) {
        throw new Error("AI service is currently busy. Please try again later.");
      }
      const openai = new OpenAI({ apiKey });

      const prompt = `Brainstorm a detailed, first-person personality for an AI agent in a SocialFi simulation called "PolyAI Betting Arena". The agent's personality should be based on these keywords: "${keywords}". The description should be under 80 words.`;
      
      const createCompletion = () => openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
      });
      const completion = await this.retry(createCompletion);
      const personality = completion.choices[0].message.content?.trim() ?? "I am an AI agent.";
      return { personality };
    } catch (error) {
      console.error(`[AiService] Brainstorm failed for keywords "${keywords}":`, error);
      if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
          apiKeyProvider.reportRateLimit(apiKey, 60);
      }
      throw new Error("Failed to brainstorm personality.");
    }
  }

  async getDirectMessageResponse(
    agent: Agent,
    user: User,
    message: string,
    history: Interaction[]
  ): Promise<Interaction> {
    const MINIMUM_CREDITS = 10;
    if ((user.credits ?? 0) < MINIMUM_CREDITS) {
        throw new Error("You have insufficient credits to chat with your agent. Please purchase more in your profile settings.");
    }
    
    const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
    if (!apiKey) {
      throw new Error("I'm having some trouble connecting right now. All our AI providers are busy. Let's talk later.");
    }
    const openai = new OpenAI({ apiKey });

    const agentIntelBank = await bettingIntelCollection.find({ ownerHandle: agent.ownerHandle }).toArray();
    const systemPrompt = createSystemInstructions(agent, user, false, agentIntelBank as any[]);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((turn): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
        const role: 'assistant' | 'user' = turn.agentId === agent.id ? 'assistant' : 'user';
        
        if (role === 'assistant' && turn.tool_calls && turn.tool_calls.length > 0) {
            const formattedToolCalls = turn.tool_calls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                }
            }));
            return {
                role: 'assistant',
                content: turn.text || null,
                tool_calls: formattedToolCalls,
            };
        } else if (turn.agentId === 'tool') {
             return {
                role: 'tool',
                tool_call_id: (turn as any).tool_call_id,
                content: turn.text,
            };
        } else {
            return {
                role,
                content: turn.text || '',
            };
        }
      }),
      { role: 'user', content: message },
    ];

    try {
      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: messages,
        tools: agentTools,
        tool_choice: 'auto',
      });
      
      const response = await this.retry(createCompletion);
      const usage = response.usage;
      if (usage && user.handle) {
          await creditService.debitForUsage(user.handle, agent.id, usage, 'Direct Message');
      }

      const responseMessage = response.choices[0].message;
      const toolCalls = responseMessage.tool_calls;
      
      const thoughtMatch = (responseMessage.content || '').match(/^Thought:(.*)/ms);
      const thought = thoughtMatch ? thoughtMatch[1].trim() : "I will answer this directly.";
      const responseTextWithoutThought = thought ? (responseMessage.content || '').replace(/^Thought:[\s\S]*/ms, '').trim() : responseMessage.content;

      if (toolCalls) {
        messages.push(responseMessage); 
        const toolExecutionResults = [];

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          let functionResponse;
          let resultPreview;

          if (functionName === 'search_markets') {
            const { markets } = await polymarketService.searchMarkets(functionArgs.query, functionArgs.category, 1, 5, functionArgs.order);
            functionResponse = { markets };
            resultPreview = `Found ${markets.length} markets related to "${functionArgs.query}".`;
          } else if (functionName === 'get_market_details') {
            const market = await polymarketService.getMarketDetails(functionArgs.market_id);
            functionResponse = { market };
            resultPreview = market ? `Fetched details for "${market.title}".` : `Market ${functionArgs.market_id} not found.`;
          } else if (functionName === 'get_market_comments') {
            const comments = await polymarketService.getMarketComments(functionArgs.market_id.replace('polymarket-', ''), 'Market');
            functionResponse = { comments: comments.slice(0, 5).map(c => ({ user: c.profile.pseudonym, comment: c.body })) };
            resultPreview = `Found ${comments.length} comments.`;
          } else if (functionName === 'get_trader_positions') {
            const positions = await polymarketService.getWalletPositions(functionArgs.trader_address);
            functionResponse = { positions: positions.slice(0, 5).map(p => ({ market: p.title, outcome: p.outcome, size: p.size })) };
            resultPreview = `Found ${positions.length} positions for trader.`;
          } else if (functionName === 'get_my_tasks') {
            const agentWithTasks = await agentsCollection.findOne({ _id: agent._id });
            const tasks = (agentWithTasks as any).tasks || [];
            functionResponse = { tasks: tasks.map((t: AgentTask) => ({ id: t.id, objective: t.objective, status: t.status })) };
            resultPreview = `Found ${tasks.length} tasks.`;
          } else if (functionName === 'get_intel_by_id') {
            const intel = await bettingIntelCollection.findOne({ _id: new Types.ObjectId(functionArgs.intel_id) });
            functionResponse = { intel };
            resultPreview = intel ? `Retrieved intel on "${intel.market}".` : `Intel with ID ${functionArgs.intel_id} not found.`;
          } else if (functionName === 'research_web') {
            if (!firecrawlService.isConfigured()) {
                functionResponse = { error: 'Web research tool is not available.' };
                resultPreview = 'Error: Web research tool is not configured on the server.';
            } else {
                const results = await firecrawlService.search(functionArgs.query);
                functionResponse = { results: results.map(r => ({ title: r.title, url: r.url, summary: r.markdown.slice(0, 200) + '...' })) };
                resultPreview = `Found ${results.length} web results for "${functionArgs.query}".`;
            }
          } else {
             functionResponse = { status: 'Tool call noted and will be handled by the client.' };
             resultPreview = `Action: ${functionName}`;
          }
          
          toolExecutionResults.push({
            toolName: functionName,
            args: functionArgs,
            resultPreview
          });
          
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(functionResponse),
          });
        }
        
        const createSecondCompletion = () => openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: messages,
        });
        const secondResponse = await this.retry(createSecondCompletion);
        
        const secondUsage = secondResponse.usage;
        if (secondUsage && user.handle) {
            await creditService.debitForUsage(user.handle, agent.id, secondUsage, 'Tool Follow-up');
        }

        return {
            agentId: agent.id,
            agentName: agent.name,
            text: secondResponse.choices[0].message.content || '...',
            timestamp: Date.now(),
            thought: thought,
            toolExecution: toolExecutionResults,
            tool_calls: toolCalls,
        };

      }

      return { 
          agentId: agent.id, 
          agentName: agent.name, 
          text: responseTextWithoutThought || '...', 
          timestamp: Date.now(),
          thought: thought 
        };

    } catch (error) {
      console.error(`[AiService] OpenAI completion failed for direct message with ${agent.name}:`, error);
      if (error instanceof OpenAI.APIError && error.status === 429) {
        apiKeyProvider.reportRateLimit(apiKey, 60);
      }
      throw new Error("I'm having some trouble connecting right now. Let's talk later.");
    }
  }
    
  async getConversationTurn(
    currentAgent: Agent,
    otherAgent: Agent,
    history: Interaction[],
    room: Room,
    initialPrompt?: string
  ): Promise<{ text: string; endConversation: boolean; toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] }> {
    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent(currentAgent.id);
      if (!apiKey) {
        console.error(`[AiService] No API key for agent ${currentAgent.name}, ending conversation.`);
        return { text: "I have to go.", endConversation: true };
      }
      const openai = new OpenAI({ apiKey });

      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [{
          type: 'function',
          function: {
              name: 'end_conversation',
              description: 'End the current conversation if it has reached a natural conclusion or is going nowhere.',
              parameters: { type: 'object', properties: {} }
          }
      }];
      
      let systemPrompt = `You are ${currentAgent.name}. Your personality: "${currentAgent.personality}". Your goals: "${currentAgent.instructions}". You are talking to ${otherAgent.name}. Their personality: "${otherAgent.personality}". 
      
      IMPORTANT: Your primary goal is to have a natural, multi-turn conversation. DO NOT use the 'end_conversation' tool unless at least 3-4 exchanges have occurred or the other agent is unresponsive. Keep your responses concise and in character.`;
      
      systemPrompt += `\nYou are in a room with the vibe: '${room.vibe}'. Your personal topics of interest are: ${currentAgent.topics.join(', ')}. You are on the lookout for intel related to your wishlist: ${currentAgent.wishlist.join(', ')}. Try to steer the conversation towards these topics if it feels natural.`;

      if (room.rules && room.rules.length > 0) {
          systemPrompt += ` The room rules are: ${room.rules.join(', ')}.`;
      }

      try {
          if (room.isOwned && room.hostId) {
              const isHost = room.hostId === currentAgent.id;
              const host = isHost ? currentAgent : otherAgent;
              const guest = isHost ? otherAgent : currentAgent;
              
              if (isHost) {
                  const hostTradableIntel = await bettingIntelCollection.find({ 
                      ownerAgentId: new Types.ObjectId(host.id), 
                      isTradable: true 
                  }).toArray();
                  if (hostTradableIntel.length > 0) {
                      systemPrompt += ` This is your owned intel storefront. Your primary goal is to monetize your betting intel by selling it to ${guest.name}. You have the following intel to sell: ${hostTradableIntel.map(i => `(ID: ${i._id}) on ${i.market}`).join(', ')}. Use the 'create_intel_offer' tool to make a formal offer.`;
                      tools.push({
                          type: 'function',
                          function: {
                              name: 'create_intel_offer',
                              description: "Create a formal, tradable offer for a piece of your intel.",
                              parameters: {
                                  type: 'object',
                                  properties: {
                                      intel_id: { type: 'string', description: 'The ID of the intel you want to sell.' },
                                      price: { type: 'number', description: 'The price you are asking for in BOX tokens.' },
                                  },
                                  required: ['intel_id', 'price'],
                              }
                          }
                      });
                  } else {
                      systemPrompt += ` This is your owned intel storefront, but you currently have no tradable intel. Your goal is to engage ${guest.name} in conversation to learn what they're looking for.`;
                  }
              } else { // Is Guest
                  systemPrompt += ` You are in an intel storefront hosted by ${host.name}. Their purpose is to sell betting intel.`;
                  if (room.activeOffer) {
                      systemPrompt += ` There is an active offer on the table for intel on "${room.activeOffer.market}" for ${room.activeOffer.price} BOX. You can choose to accept it using the 'accept_offer' tool, or continue negotiating.`;
                      tools.push({
                          type: 'function',
                          function: {
                              name: 'accept_offer',
                              description: 'Accept the currently active intel offer in the room.',
                              parameters: {
                                  type: 'object',
                                  properties: {
                                      offer_id: { type: 'string', description: 'The ID of the intel being offered (e.g., the intelId from the offer).' }
                                  },
                              }
                          }
                      });
                  }
              }
          }
      } catch (dbError) {
          console.error('[AiService] Database error during prompt construction:', dbError);
          systemPrompt = `You are ${currentAgent.name}. Your personality: "${currentAgent.personality}". You are talking to ${otherAgent.name}. Their personality: "${otherAgent.personality}". Keep your responses concise and in character. A database error occurred, so you cannot access your intel right now.`;
      }


      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
      ];
      
      history.forEach(turn => {
          messages.push({
              role: turn.agentId === currentAgent.id ? 'assistant' : 'user',
              name: turn.agentName.replace(/\s+/g, '_'),
              content: turn.text,
          });
      });

      if (history.length === 0 && initialPrompt) {
          messages.push({ role: 'user', name: otherAgent.name.replace(/\s+/g, '_'), content: initialPrompt });
      }

      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
      });
      const completion = await this.retry(createCompletion);
      
      const choice = completion.choices[0];
      const toolCalls = choice.message.tool_calls;

      if (toolCalls) {
          if (toolCalls.some(tc => tc.type === 'function' && tc.function.name === 'end_conversation')) {
              return { text: choice.message.content || "It was nice talking to you. Goodbye.", endConversation: true, toolCalls };
          }
      }

      return { 
          text: choice.message.content || "...", 
          endConversation: false,
          toolCalls: toolCalls || undefined
      };
    } catch (error) {
        console.error(`[AiService] OpenAI completion failed for ${currentAgent.name}:`, error);
        if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 60);
        }
        return { text: "I'm not feeling well, I need to go.", endConversation: true };
    }
  }

  async analyzeMarket(agent: Agent, market: MarketIntel, comments?: any[]): Promise<string> {
    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
      if (!apiKey) throw new Error("API key not available for this agent.");

      const openai = new OpenAI({ apiKey });
      
      const firecrawlData = firecrawlService.isConfigured() ? await firecrawlService.search(market.title) : [];
      const researchContext = firecrawlData.length > 0
          ? `\n\nHere is some real-time web research on this topic:\n` + firecrawlData.map(r => `Source: ${r.title}\nContent: ${r.markdown.slice(0, 1500)}...`).join('\n\n')
          : '';

      const systemPrompt = `You are ${agent.name}, an AI copilot for prediction markets. Your personality is: "${agent.personality}".`;
      let userPrompt = `My user is looking at the following market. Provide a brief, in-character analysis (2-3 sentences) based on all the data provided.
      
      Market: "${market.title}"
      Description: ${market.description}
      Yes Odds: ${Math.round(market.odds.yes * 100)}¢
      Ends At: ${new Date(market.endsAt).toLocaleString()}
      ${researchContext}
      `;

      if (comments && comments.length > 0) {
          const commentSnippets = comments.slice(0, 5).map(c => `- ${c.profile.pseudonym}: "${c.body}"`).join('\n');
          userPrompt += `\n\nAlso consider the latest public sentiment from user comments:\n${commentSnippets}\nSummarize the general sentiment and factor it into your final analysis.`;
      }
      
      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
      });
      const completion = await this.retry(createCompletion);
      return completion.choices[0].message.content?.trim() ?? "I'm not sure what to make of this one.";
    } catch (error) {
        console.error(`[AiService] analyzeMarket failed for ${agent.name}:`, error);
        if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 30);
        }
        throw new Error("Failed to get analysis from the AI.");
    }
  }

  async suggestBet(query: string, agentId: string) {
    let apiKey: string | null = null;
    try {
      const agent = await agentsCollection.findOne({ id: agentId });
      if (!agent) throw new Error("Agent not found");

      apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
      if (!apiKey) throw new Error("API key not available for this agent.");

      const openai = new OpenAI({ apiKey });
      
      const [polymarketResults, kalshiResults, agentIntel] = await Promise.all([
          polymarketService.searchMarkets(query),
          kalshiService.searchMarkets(query),
          bettingIntelCollection.find({ ownerAgentId: new Types.ObjectId(agentId) }).toArray()
      ]);
      const markets: MarketIntel[] = [...polymarketResults.markets, ...kalshiResults];

      const systemPrompt = `
        You are ${agent.name}, an AI copilot for prediction markets.
        Your personality: "${agent.personality}".

        Analyze the user's query and the provided market data. Provide a single, actionable bet suggestion.
        If the suggestion is based on intel you have, you MUST include the "sourceIntelId".
        
        You MUST use the "propose_bet" tool to formalize your suggestion.
      `;

      const userPrompt = `
        User query: "${query}"

        Available Markets:
        ${JSON.stringify(markets.slice(0, 10), null, 2)}

        Your Private Intel:
        ${JSON.stringify(agentIntel, null, 2)}
      `;

      const createCompletion = () => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        tools: agentTools,
        tool_choice: { type: 'function', function: { name: 'propose_bet' } },
      });
      const completion = await this.retry(createCompletion);
      
      const toolCall = completion.choices[0].message.tool_calls?.[0];
      if (!toolCall || toolCall.type !== 'function' || toolCall.function.name !== 'propose_bet') {
        throw new Error("AI did not propose a bet using the required tool.");
      }

      const betArgs = JSON.parse(toolCall.function.arguments);
      
      return {
        analysis: betArgs.analysis,
        suggestion: {
          marketId: betArgs.marketId,
          outcome: betArgs.outcome,
          amount: betArgs.amount,
          price: betArgs.price,
          sourceIntelId: betArgs.sourceIntelId,
        }
      };

    } catch (error) {
      console.error(`[AiService] suggestBet failed for agent ID ${agentId}:`, error);
       if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 30);
        }
      throw new Error("Failed to get a bet suggestion from the AI.");
    }
  }
  
  async generateDailySummary(activities: { trades: TradeRecord[], intel: BettingIntel[] }): Promise<string | null> {
    let apiKey: string | null = null;
    try {
      apiKey = await apiKeyProvider.getKeyForAgent('system-summary');
      if (!apiKey) {
        console.error(`[AiService] No API key available for generating daily summary.`);
        return null;
      }
      const openai = new OpenAI({ apiKey });
      
      const prompt = `
        You are an assistant who summarizes an AI agent's daily activity.
        Based on the following recent trades and authored intel, write a short, one-paragraph summary of the agent's day.
        Focus on key activities and outcomes. Be concise and write in a professional, report-like tone.

        Recent Trades:
        ${activities.trades.length > 0 ? JSON.stringify(activities.trades) : "No trades today."}

        Recent Authored Intel:
        ${activities.intel.length > 0 ? JSON.stringify(activities.intel.map(i => ({ market: i.market, content: i.content }))) : "No new intel authored today."}
      `;

      const createCompletion = () => openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });
      const completion = await this.retry(createCompletion);
      return completion.choices[0].message.content?.trim() ?? null;
    } catch (error) {
       console.error(`[AiService] Failed to generate daily summary:`, error);
       if (error instanceof OpenAI.APIError && error.status === 429 && apiKey) {
            apiKeyProvider.reportRateLimit(apiKey, 60);
        }
      return "Failed to generate summary due to an internal error.";
    }
  }
}
export const aiService = new AiService();
