/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent, useUser, useUI } from '../state.js';
import { Agent } from '../presets/agents.js';
import { User } from '../state.js';
import { Interaction, Room, useArenaStore } from '../state/arena.js';
import { Bounty, Intel, useAutonomyStore } from '../state/autonomy.js';
import { Transaction, useWalletStore } from '../state/wallet.js';
import { API_BASE_URL } from '../config.js';

interface ChatResponse {
  agentMessage: Interaction;
  contextToken?: Intel;
}

interface BootstrapResponse {
    user: User;
    agents: Agent[];
    rooms: Room[];
    conversations: Interaction[];
    bounties: Bounty[];
    intel: Intel[];
    transactions: Transaction[];
}

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error(`API request to ${endpoint} failed:`, error);
      throw error;
    }
  }

  public async bootstrap(handle: string): Promise<{ success: boolean }> {
    try {
      const response = await this.request<BootstrapResponse>('/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ handle }),
      });

      useUser.setState(response.user);
      useAgent.setState({ availablePersonal: response.agents });
      useArenaStore.getState().hydrate(response);
      useAutonomyStore.getState().hydrate(response);
      useWalletStore.getState().hydrate(response);
      
      useUI.getState().setIsSignedIn(true);

      console.log(`[ApiService] Bootstrapped and hydrated all data for ${handle}`);
      return { success: true };
    } catch (error) {
      useUI.getState().setIsSignedIn(false);
      return { success: false };
    }
  }

  public async connectWallet(address: string): Promise<{ success: boolean; address?: string }> {
     const signatureRequest = window.confirm(
      'Please sign this message to verify ownership of your wallet.\n\n(This is a simulation. No real transaction will occur.)'
    );
    if (!signatureRequest) {
      return { success: false };
    }
    
    const handle = useUser.getState().handle;
    const updatedUser = await this.request<User>('/user', {
        method: 'PUT',
        body: JSON.stringify({ handle, updates: { solanaWalletAddress: address } }),
    });
    useUser.setState(updatedUser);
    return { success: true, address };
  }

  public async disconnectWallet(): Promise<{ success: boolean }> {
    const handle = useUser.getState().handle;
    const updatedUser = await this.request<User>('/user', {
        method: 'PUT',
        body: JSON.stringify({ handle, updates: { solanaWalletAddress: null } }),
    });
    useUser.setState(updatedUser);
    return { success: true };
  }

  public async saveApiKey(apiKey: string): Promise<{ success: boolean }> {
    const handle = useUser.getState().handle;
    const updatedUser = await this.request<User>('/user', {
        method: 'PUT',
        body: JSON.stringify({ handle, updates: { userApiKey: apiKey } }),
    });
    useUser.setState(updatedUser);
    return { success: true };
  }

  public async saveNewAgent(agent: Agent): Promise<{ success: boolean, agent: Agent }> {
    const newAgent = await this.request<Agent>('/agents', {
        method: 'POST',
        body: JSON.stringify(agent),
    });
    // The server is now the source of truth. The client state will update via
    // the response from this call and subsequent WebSocket events.
    useAgent.getState().addAgent(newAgent);
    // The server will handle registering the agent in its own simulation state.
    // registerAgentInArena(newAgent.id);
    return { success: true, agent: newAgent };
  }

  public async updateAgent(agentId: string, updates: Partial<Agent>): Promise<{ success: boolean, agent: Agent }> {
    const updatedAgent = await this.request<Agent>(`/agents/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
    useAgent.getState().update(agentId, updatedAgent);
    return { success: true, agent: updatedAgent };
  }

  public async syncOnboardingComplete(handle: string): Promise<void> {
    try {
      const updatedUser = await this.request<User>('/user', {
        method: 'PUT',
        body: JSON.stringify({
          handle,
          updates: { hasCompletedOnboarding: true },
        }),
      });
      useUser.setState(updatedUser);
    } catch (error) {
      console.error('Failed to sync onboarding completion with server:', error);
    }
  }

  public async sendDirectMessage(message: string): Promise<ChatResponse> {
    const { handle } = useUser.getState();
    const { current: agent } = useAgent.getState();
    if (!handle || !agent) throw new Error("User or agent not set");

    return this.request<ChatResponse>('/chat', {
        method: 'POST',
        body: JSON.stringify({ handle, agentId: agent.id, message }),
    });
  }
  
  public async transcribeAudio(audioBase64: string): Promise<{ text: string }> {
     return this.request<{ text: string }>('/transcribe', {
        method: 'POST',
        body: JSON.stringify({ audio: audioBase64 }),
    });
  }

  public async getAgentActivity(agentId: string): Promise<any[]> {
    return this.request<any[]>(`/agents/${agentId}/activity`);
  }
  
  public async scoutToken(query: string): Promise<Intel> {
    const { handle } = useUser.getState();
    return this.request<Intel>('/scout', {
      method: 'POST',
      body: JSON.stringify({ query, handle }),
    });
  }

  public async sendAgentToCafe(agentId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/agents/${agentId}/join-cafe`, {
        method: 'POST',
    });
  }

  public async createAndHostRoom(agentId: string): Promise<{ success: boolean }> {
      return this.request<{ success: boolean }>(`/agents/${agentId}/create-room`, {
          method: 'POST',
      });
  }
}

export const apiService = new ApiService();