/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { API_BASE_URL } from '../config.js';
// FIX: Import types from canonical source to avoid circular dependencies and resolve type errors.
import type { Agent, User, Bet, MarketIntel, Room, Interaction, MarketWatchlist } from '../types/index.js';
// FIX: Add missing imports for state stores.
import { useAgent, useUser, useArenaStore, useAutonomyStore, useWalletStore } from '../state/index.js';

class ApiService {
  // FIX: Make request method public for generic use.
  public async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const handle = useUser.getState().handle;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options?.headers,
      // Include user handle for authentication on the backend
      'X-User-Handle': handle || '',
    };

    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => ({ message: 'An unknown error occurred' }));
        const errorMessage = (typeof errorData === 'object' && errorData !== null && 'message' in errorData && typeof (errorData as any).message === 'string')
          ? (errorData as any).message
          : `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }
      // Handle cases where the response body might be empty (e.g., for a 204 No Content)
      const text = await response.text();
      return text ? JSON.parse(text) : ({} as T);
    } catch (error) {
      console.error(`API request to ${endpoint} failed:`, error);
      throw error;
    }
  }

  // --- User & Auth ---
  async bootstrap(handle: string): Promise<{ success: boolean }> {
      const data = await this.request<any>(`/api/bootstrap/${handle}`);
      
      // Hydrate all stores with server data
      useUser.getState()._setHandle(data.user.handle);
      useUser.setState(data.user);
      useAgent.setState({
          availablePersonal: data.agents,
          availablePresets: data.presets,
          current: data.agents.find((a: Agent) => a.id === data.user.currentAgentId) || data.presets.find((a: Agent) => a.id === data.user.currentAgentId) || data.agents[0] || data.presets[0] || useAgent.getState().current,
      });
      useAutonomyStore.getState().hydrate(data.autonomy);
      useWalletStore.getState().hydrate(data.wallet);

      return { success: true };
  }
  
  async checkHandle(handle: string): Promise<{ available: boolean; isNewUser: boolean; }> {
    return this.request<{ available: boolean; isNewUser: boolean; }>(`/api/users/check-handle/${handle}`);
  }

  async registerUser(handle: string): Promise<{ user: User }> {
      return this.request<{ user: User }>('/api/users/register', {
          method: 'POST',
          body: JSON.stringify({ handle }),
      });
  }

  async connectWallet(address: string): Promise<void> {
    await this.request<void>('/api/users/wallet/connect', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }
  
  async disconnectWallet(): Promise<void> {
    await this.request<void>('/api/users/wallet/disconnect', { method: 'POST' });
  }
  
  async recoverByWallet(address: string): Promise<{ handle: string }> {
      return this.request<{ handle: string }>(`/api/users/recover/${address}`);
  }

  // --- Agents ---
  // FIX: Changed agent type from Agent to Partial<Agent> because the client does not create the ID.
  async saveNewAgent(agent: Partial<Agent>): Promise<{ agent: Agent }> {
    return this.request<{ agent: Agent }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(agent),
    });
  }

  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<{ agent: Agent }> {
    return this.request<{ agent: Agent }>(`/api/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }
  
  async addMarketWatchlist(agentId: string, watchlist: Omit<MarketWatchlist, 'id' | 'createdAt'>): Promise<{ watchlist: MarketWatchlist }> {
    return this.request<{ watchlist: MarketWatchlist }>(`/api/agents/${agentId}/watchlists`, {
        method: 'POST',
        body: JSON.stringify(watchlist),
    });
  }

  async deleteMarketWatchlist(agentId: string, watchlistId: string): Promise<void> {
    await this.request<void>(`/api/agents/${agentId}/watchlists/${watchlistId}`, {
        method: 'DELETE',
    });
  }

  // --- Agent Actions & AI ---
  async brainstormPersonality(keywords: string): Promise<{ personality: string }> {
    return this.request<{ personality: string }>('/api/ai/brainstorm-personality', {
      method: 'POST',
      body: JSON.stringify({ keywords }),
    });
  }

  async sendDirectMessage(message: string, history: Interaction[]): Promise<{ agentMessage: Interaction }> {
    const agentId = useAgent.getState().current.id;
    return this.request<{ agentMessage: Interaction }>('/api/ai/direct-message', {
        method: 'POST',
        body: JSON.stringify({ agentId, message, history }),
    });
  }
  
  async transcribeAudio(audioBase64: string): Promise<{ text: string }> {
      return this.request<{ text: string }>('/api/ai/transcribe', {
          method: 'POST',
          body: JSON.stringify({ audio: audioBase64 }),
      });
  }
  
  async startResearch(agentId: string, handle: string): Promise<void> {
      await this.request<void>('/api/autonomy/start-research', {
          method: 'POST',
          body: JSON.stringify({ agentId, handle }),
      });
  }

  async sendAgentToCafe(agentId: string): Promise<void> {
      await this.request<void>('/api/arena/send-to-cafe', {
          method: 'POST',
          body: JSON.stringify({ agentId }),
      });
  }

  async createAndHostRoom(agentId: string): Promise<void> {
      await this.request<void>('/api/arena/create-room', {
          method: 'POST',
          body: JSON.stringify({ agentId }),
      });
  }

  async purchaseRoom(details: { name: string }): Promise<{ room: Room }> {
    return this.request<{ room: Room }>('/api/rooms/purchase', {
      method: 'POST',
      body: JSON.stringify(details),
    });
  }

  async updateRoom(roomId: string, updates: Partial<Room>): Promise<{ room: Room }> {
    return this.request<{ room: Room }>(`/api/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.request<void>(`/api/rooms/${roomId}`, {
      method: 'DELETE',
    });
  }
  
  async getAgentActivitySummary(agentId: string): Promise<{ summary: string }> {
      return this.request<{ summary: string }>(`/api/agents/${agentId}/activity`);
  }

  async addBettingIntel(agentId: string, intel: any): Promise<void> {
      await this.request<void>(`/api/agents/${agentId}/intel`, {
          method: 'POST',
          body: JSON.stringify(intel),
      });
  }

  // --- Markets & Betting ---
  async getLiveMarkets(): Promise<{ markets: MarketIntel[], hasMore: boolean }> {
      return this.request<{ markets: MarketIntel[], hasMore: boolean }>('/api/markets/live');
  }

  async placeBet(agentId: string, bet: Partial<Bet>): Promise<void> {
      await this.request<void>('/api/bets', {
          method: 'POST',
          body: JSON.stringify({ agentId, ...bet }),
      });
  }

  async resetDatabase(): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/system/reset-database', {
      method: 'POST',
    });
  }

  // Make the generic request method public for one-off calls
  public async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }
}

export const apiService = new ApiService();