import { agentsCollection, intelCollection, activityLogCollection, usersCollection } from '../db.js';
import { alphaService } from '../services/alpha.service.js';
import { Intel } from '../../lib/state/autonomy.js';

const SERVER_API_KEY = process.env.GEMINI_API_KEY;

type EmitToMainThread = (message: { type: 'socketEmit', event: string, payload: any, room?: string }) => void;

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
  
  private async handleIntelGathering() {
      if (Math.random() < 0.1) {
          const newTokens = await alphaService.discoverNewTokens();
          if (newTokens.length > 0) {
            const token = newTokens[0];
            console.log(`[AutonomyDirector] Discovered new token: ${token.symbol}`);
            
            const allAgents = await agentsCollection.find().toArray();
            if (allAgents.length === 0) return;

            const randomAgent = allAgents[Math.floor(Math.random() * allAgents.length)];

            let apiKey: string | null | undefined = null;
            let keyOwner: string = 'server';

            if (randomAgent.ownerHandle) {
                const owner = await usersCollection.findOne({ handle: randomAgent.ownerHandle });
                apiKey = owner?.userApiKey;
                keyOwner = randomAgent.ownerHandle;
            } else {
                apiKey = SERVER_API_KEY;
            }

            if (!apiKey) {
                console.warn(`[AutonomyDirector] Cannot synthesize intel for ${randomAgent.name}. No API key for key owner: ${keyOwner}.`);
                return;
            }

            const existingIntel = await intelCollection.findOne({ id: `intel-${token.mintAddress}` });
            if (!existingIntel) {
                try {
                    const analysis = await alphaService.scoutTokenByQuery(token.mintAddress);
                    const summary = await alphaService.synthesizeIntelWithAI(analysis, apiKey);

                    const newIntel: Intel = {
                        ...analysis,
                        id: `intel-${token.mintAddress}`,
                        token: token.symbol,
                        summary,
                        timestamp: Date.now(),
                        source: 'Autonomous Discovery',
                        ownerHandle: randomAgent.ownerHandle,
                    } as Intel;

                    await intelCollection.insertOne(newIntel);
                    this.logActivity(randomAgent.id, 'intel_discovery', `Discovered new intel for $${token.symbol}.`);
                    
                    if (randomAgent.ownerHandle) {
                       console.log(`[AutonomyDirector] New intel for ${token.symbol} generated and saved for user ${randomAgent.ownerHandle}`);
                       this.emitToMain?.({ type: 'socketEmit', event: 'newIntel', payload: { intel: newIntel }, room: randomAgent.ownerHandle });
                    } else {
                        console.log(`[AutonomyDirector] New intel for ${token.symbol} generated and saved for MCP ${randomAgent.name}`);
                    }
                } catch (error) {
                     console.error(`[AutonomyDirector] Gemini API call failed for agent ${randomAgent.name} using key of ${keyOwner}:`, error);
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
