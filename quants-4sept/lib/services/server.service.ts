/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { Agent } from '../presets/agents';
import { useAgent } from '../state';

/**
 * A placeholder service that simulates a remote server/database.
 * It uses localStorage for persistence but provides an async interface
 * to mimic real network calls. This architecture allows for a seamless
 * transition to a real backend (e.g., Node.js + MongoDB) in the future.
 */
class ServerService {
  private SIMULATED_DELAY = 100; // ms

  private async delay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.SIMULATED_DELAY));
  }

  /**
   * "Registers" an agent to the "server". In this simulation, it ensures
   * the agent's data is saved in the persisted Zustand store.
   * @param agent The agent object to register.
   */
  public async registerAgent(agent: Agent): Promise<{ success: boolean; agentId: string }> {
    await this.delay();
    try {
        // In a real backend, you'd save this to a database.
        // Here, we rely on the fact that adding the agent to the Zustand store
        // will persist it to localStorage.
        const { addAgent } = useAgent.getState();
        addAgent(agent);
        console.log(`[ServerService (SIMULATED)] Registered agent: ${agent.name} (${agent.id})`);
        return { success: true, agentId: agent.id };
    } catch (error) {
        console.error('[ServerService (SIMULATED)] Failed to register agent:', error);
        return { success: false, agentId: '' };
    }
  }

   /**
   * Retrieves the profile for a specific agent from the unified registry.
   * @param agentId The ID of the agent to retrieve.
   */
  public async getAgentProfile(agentId: string): Promise<Agent | null> {
    await this.delay();
    try {
        // In a real backend, you'd fetch this from a single 'agents' collection.
        // Here, we simulate that by searching both personal and preset stores.
        const { availablePersonal, availablePresets } = useAgent.getState();
        const allAgents = [...availablePersonal, ...availablePresets];
        const agent = allAgents.find(a => a.id === agentId);
        
        if (agent) {
             console.log(`[ServerService (SIMULATED)] Fetched profile for agent: ${agent.name}`);
             return agent;
        } else {
             console.warn(`[ServerService (SIMULATED)] Could not find agent with ID: ${agentId}`);
             return null;
        }
    } catch (error) {
        console.error('[ServerService (SIMULATED)] Failed to fetch agent profile:', error);
        return null;
    }
  }

  /**
   * Updates a personal agent's profile on the "server".
   * @param agentId The ID of the agent to update.
   * @param updates A partial agent object with the fields to update.
   */
  public async updateAgentProfile(agentId: string, updates: Partial<Agent>): Promise<{ success: boolean }> {
      await this.delay();
      try {
        // In a real backend, you'd update this in a database.
        // Here, we update it in the persisted Zustand store.
        const { update } = useAgent.getState();
        update(agentId, updates);
        console.log(`[ServerService (SIMULATED)] Updated profile for agent: ${agentId}`);
        return { success: true };
      } catch (error) {
         console.error('[ServerService (SIMULATED)] Failed to update agent profile:', error);
         return { success: false };
      }
  }
}

export const serverService = new ServerService();