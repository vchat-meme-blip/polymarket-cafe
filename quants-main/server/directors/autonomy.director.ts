import { agentsCollection, intelCollection, activityLogCollection, bountiesCollection } from '../db.js';
import { alphaService } from '../services/alpha.service.js';
import { Intel } from '../../lib/types/index.js';
import { apiKeyProvider } from '../services/apiKey.provider.js';

type EmitToMainThread = (message: 
  | { type: 'socketEmit', event: string, payload: any, room?: string }
  | { type: 'worldState', payload: any }
  | { type: 'globalPause', payload: { duration: number, reason: string, resumeTime: number } }
) => void;

export class AutonomyDirector {
  private emitToMain: EmitToMainThread | null = null;
  private isTicking = false;

  constructor() {
    console.log('[AutonomyDirector] Initialized.');
  }

  public initialize(emitCallback: EmitToMainThread) {
    this.emitToMain = emitCallback;
  }
  
  private async logActivity(agentId: string, type: 'intel_discovery' | 'bounty_hit', description: string, details?: Record<string, any>) {
    await activityLogCollection.insertOne({
        agentId, type, description, details, timestamp: Date.now(),
    });
  }
  
  public async researchForAgent(agentId: string) {
    const agent = await agentsCollection.findOne({ id: agentId });
    if (!agent) {
      console.error(`[AutonomyDirector] Agent ${agentId} not found for research task.`);
      return;
    }

    const apiKey = await apiKeyProvider.getKeyForAgent(agent.id);
    if (!apiKey) {
      console.warn(`[AutonomyDirector] No API key for ${agent.name}, skipping research.`);
      return;
    }

    console.log(`[AutonomyDirector] Starting direct research for ${agent.name}...`);

    try {
      const newTokens = await alphaService.discoverNewTokens();
      console.log(`[AutonomyDirector] Discovered ${newTokens.length} potential tokens for analysis.`);

      for (const token of newTokens) {
        const existingIntel = await intelCollection.findOne({ id: `intel-${token.mintAddress}` });
        if (existingIntel) {
          console.log(`[AutonomyDirector] Skipping ${token.symbol}, intel already exists.`);
          continue;
        }

        console.log(`[AutonomyDirector] Analyzing new token: $${token.symbol}`);
        const analysis = await alphaService.scoutTokenByQuery(token.mintAddress);

        if (analysis?.marketData?.mintAddress) {
            const summary = await alphaService.synthesizeIntelWithAI(analysis, apiKey);
            const newIntel: Intel = {
                id: `intel-${analysis.marketData.mintAddress}`,
                token: token.symbol,
                source: `Research by ${agent.name}`,
                summary,
                timestamp: Date.now(),
                ownerHandle: agent.ownerHandle,
                marketData: analysis.marketData,
                socialSentiment: analysis.socialSentiment,
                securityAnalysis: analysis.securityAnalysis,
            };

            await intelCollection.insertOne(newIntel);
            this.logActivity(agent.id, 'intel_discovery', `Discovered new intel for $${token.symbol}.`);
            
            if (agent.ownerHandle) {
                console.log(`[AutonomyDirector] New intel for ${token.symbol} generated for user ${agent.ownerHandle}`);
                this.emitToMain?.({ type: 'socketEmit', event: 'newIntel', payload: { intel: newIntel }, room: agent.ownerHandle });
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            console.log(`[AutonomyDirector] Analysis for ${token.symbol} was incomplete, skipping.`);
            this.emitToMain?.({ type: 'socketEmit', event: 'systemMessage', payload: { message: `Research failed for ${token.symbol}: Analysis was incomplete.` }, room: agent.ownerHandle });
        }
      }
    } catch (error) {
      console.error(`[AutonomyDirector] Direct research failed for agent ${agent.name}:`, error);
      if (typeof error === 'object' && error !== null && 'status' in error && (error as any).status === 429 && apiKey) {
        apiKeyProvider.reportRateLimit(apiKey, 60);
      }
    }
  }

  private async handleIntelGathering() {
      if (Math.random() < 0.8) { // Increased from 10% to 80% for more frequent discoveries
          const newTokens = await alphaService.discoverNewTokens();
          if (newTokens.length > 0) {
            const token = newTokens[0];
            console.log(`[AutonomyDirector] Discovered new token: ${token.symbol}`);
            
            // --- INTELLIGENT AGENT ASSIGNMENT ---
            const tokenSymbolRegex = new RegExp(token.symbol, 'i');
            const agentsWithMatchingWishlist = await agentsCollection.find({ wishlist: tokenSymbolRegex }).toArray();
            const bountiesForToken = await bountiesCollection.find({ objective: tokenSymbolRegex, status: 'active' }).toArray();
            const ownerHandlesWithBounties = bountiesForToken.map(b => b.ownerHandle);
            const agentsWithMatchingBounties = await agentsCollection.find({ ownerHandle: { $in: ownerHandlesWithBounties } }).toArray();
            
            let potentialAgents = [...agentsWithMatchingWishlist, ...agentsWithMatchingBounties];
            let targetAgent = null;

            if (potentialAgents.length > 0) {
                // De-duplicate and pick one
                const uniqueAgents = Array.from(new Map(potentialAgents.map(a => [a.id, a])).values());
                targetAgent = uniqueAgents[Math.floor(Math.random() * uniqueAgents.length)];
                console.log(`[AutonomyDirector] Assigning intel task for $${token.symbol} to ${targetAgent.name} based on goals.`);
            } else {
                 // Fallback to a random MCP if no user agent has matching goals
                const mcps = await agentsCollection.find({ ownerHandle: { $exists: false } }).toArray();
                if (mcps.length > 0) {
                    targetAgent = mcps[Math.floor(Math.random() * mcps.length)];
                    console.log(`[AutonomyDirector] Assigning intel task for $${token.symbol} to random MCP ${targetAgent.name}.`);
                }
            }

            if (!targetAgent) {
                console.log(`[AutonomyDirector] No available agent to research $${token.symbol}.`);
                return;
            }

                        const apiKey = await apiKeyProvider.getKeyForAgent(targetAgent.id);
            if (!apiKey) {
                console.warn(`[AutonomyDirector] Cannot synthesize intel for ${targetAgent.name}. No API key available, skipping task.`);
                return; // Explicitly return to stop execution for this task.
            }

            const existingIntel = await intelCollection.findOne({ id: `intel-${token.mintAddress}` });
            if (!existingIntel) {
                try {
                    const analysis = await alphaService.scoutTokenByQuery(token.mintAddress);
                    if (analysis?.marketData?.mintAddress) {
                        try {
                            const summary = await alphaService.synthesizeIntelWithAI(analysis, apiKey);
                            const newIntel: Intel = {
                                id: `intel-${analysis.marketData.mintAddress}`,
                                token: token.symbol,
                                source: 'Autonomous Discovery',
                                summary,
                                timestamp: Date.now(),
                                ownerHandle: targetAgent.ownerHandle,
                                marketData: analysis.marketData,
                                socialSentiment: analysis.socialSentiment,
                                securityAnalysis: analysis.securityAnalysis,
                            };

                            await intelCollection.insertOne(newIntel);
                            this.logActivity(targetAgent.id, 'intel_discovery', `Discovered new intel for $${token.symbol}.`);
                            
                            if (targetAgent.ownerHandle) {
                                console.log(`[AutonomyDirector] New intel for ${token.symbol} generated and saved for user ${targetAgent.ownerHandle}`);
                                this.emitToMain?.({ type: 'socketEmit', event: 'newIntel', payload: { intel: newIntel }, room: targetAgent.ownerHandle });
                            } else {
                                console.log(`[AutonomyDirector] New intel for ${token.symbol} generated and saved for MCP ${targetAgent.name}`);
                            }
                        } catch (error) {
                            console.log(`[AutonomyDirector] Analysis for ${token.symbol} was incomplete, skipping.`);
                        }
                    } else {
                        console.log(`[AutonomyDirector] Analysis for ${token.symbol} was incomplete, skipping.`);
                    }
                } catch (error) {
                    console.error(`[AutonomyDirector] Gemini API call failed for agent ${targetAgent.name}:`, error);
                    if (typeof error === 'object' && error !== null && 'status' in error && (error as any).status === 429 && apiKey) {
                        apiKeyProvider.reportRateLimit(apiKey, 60); // Longer cooldown for autonomy tasks
                    }
                }
            }
          }
      }
  }

  public async tick() {
    if (this.isTicking) return;
    this.isTicking = true;
    
    try {
        await this.handleIntelGathering();
    } catch (error) {
        console.error('[AutonomyDirector] Error during tick:', error);
    } finally {
        this.isTicking = false;
    }
  }
}