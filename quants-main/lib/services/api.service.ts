/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent, useUser, useUI } from '../state.js';
import { Agent, User, Room, Interaction, Bounty, Intel, Transaction } from '../types/index.js';
import { useArenaStore } from '../state/arena.js';
import { useAutonomyStore } from '../state/autonomy.js';
import { useWalletStore } from '../state/wallet.js';
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
  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}/api${endpoint}`;
    console.log(`[API] Making request to: ${url}`);
    console.log(`[API] Request options:`, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body ? JSON.parse(options.body as string) : undefined
    });

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      console.log(`[API] Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
          console.error(`[API] Error response:`, errorData);
        } catch (e) {
          const text = await response.text();
          console.error(`[API] Non-JSON error response:`, text);
          throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
        }
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[API] Response data:`, data);
      return data;
      
    } catch (error) {
      console.error(`[API] Request to ${endpoint} failed:`, error);
      throw error;
    }
  }

  public async checkHandle(handle: string): Promise<{ available: boolean, isNewUser: boolean }> {
    console.log(`[API] Checking handle availability for: ${handle}`);
    try {
      const result = await this.request<{ available: boolean, isNewUser: boolean }>('/user/check-handle', {
        method: 'POST',
        body: JSON.stringify({ handle }),
      });
      console.log(`[API] Handle check result for ${handle}:`, result);
      return result;
    } catch (error) {
      console.error(`[API] Error checking handle ${handle}:`, error);
      throw error;
    }
  }

  public async registerUser(handle: string, name: string = ''): Promise<{ success: boolean, user: User }> {
    console.log(`[API] Registering new user with handle: ${handle}`);
    console.log(`[API] Making request to: ${API_BASE_URL}/api/user/register`);
    
    try {
      const requestBody = { handle, name };
      console.log('[API] Request body:', JSON.stringify(requestBody, null, 2));
      
      const result = await this.request<{ success: boolean, user: User }>('/user/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log(`[API] User registration successful for ${handle}:`, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[API] Error registering user ${handle}:`, errorMessage);
      console.error('Full error:', error);
      throw error;
    }
  }

  public async recoverByWallet(walletAddress: string): Promise<{ handle: string }> {
    return this.request<{ handle: string }>('/user/recover-by-wallet', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    });
  }

  public async bootstrap(handle: string): Promise<{ success: boolean }> {
    console.log(`[API] Bootstrapping data for user: ${handle}`);
    try {
      const response = await this.request<BootstrapResponse>('/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ handle }),
      });
      console.log(`[API] Bootstrap response for ${handle}:`, {
        user: response.user,
        agentCount: response.agents?.length || 0,
        roomCount: response.rooms?.length || 0,
        hasCompletedOnboarding: response.user?.hasCompletedOnboarding
      });

      // Update user state - the backend should already be sending timestamps as numbers
      useUser.setState({
        ...response.user,
        name: response.user.name || '',
        info: response.user.info || '',
        hasCompletedOnboarding: response.user.hasCompletedOnboarding || false,
        userApiKey: response.user.userApiKey || null,
        solanaWalletAddress: response.user.solanaWalletAddress || null
      });

      // Update UI state if needed - only open onboarding for new users who haven't completed it
      const isNewUser = !response.user.hasCompletedOnboarding && 
                       (response.agents.length === 0 || 
                        response.agents.every(a => a.isPreset));
      
      if (isNewUser) {
        console.log('New user detected, opening onboarding...');
        // Ensure we're in the signed-in state first
        useUI.getState().setIsSignedIn(true);
        
        // Small delay to ensure the UI has updated
        setTimeout(() => {
          console.log('Opening onboarding...');
          useUI.getState().openOnboarding();
        }, 100);
      } else {
        console.log('Existing user or onboarding completed, skipping...');
      }

      // Intelligently merge agents to prevent race conditions where a bootstrap
      // overwrites a newly created agent before it's in the DB.
      useAgent.setState(state => {
        const newAgents = response.agents;
        const existingAgentMap = new Map(state.availablePersonal.map(agent => [agent.id, agent]));
        newAgents.forEach(agent => existingAgentMap.set(agent.id, agent));
        return { availablePersonal: Array.from(existingAgentMap.values()) };
      });
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
    // Instead of just adding, we merge to prevent race conditions
    // where a bootstrap might temporarily overwrite the new agent.
    useAgent.setState(state => {
      // Remove any existing agent with the same ID to avoid duplicates
      const filteredAgents = state.availablePersonal.filter(a => a.id !== newAgent.id);
      return { availablePersonal: [...filteredAgents, newAgent] };
    });
    return { success: true, agent: newAgent };
  }

  public async updateAgent(agentId: string, updates: Partial<Agent>): Promise<{ success: boolean, agent: Agent }> {
    const updatedAgent = await this.request<Agent>(`/agents/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
    // Perform an atomic update to prevent race conditions.
    useAgent.setState(state => ({
      availablePersonal: state.availablePersonal.map(a => a.id === agentId ? updatedAgent : a),
      current: state.current.id === agentId ? updatedAgent : state.current,
    }));
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

  public async getAgentActivitySummary(agentId: string): Promise<{ summary: string; logs: any[]; stats: any }> {
    return this.request<{ summary: string; logs: any[]; stats: any }>(`/agents/${agentId}/activity-summary`);
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

  public async brainstormPersonality(keywords: string): Promise<{ personality: string }> {
    return this.request<{ personality: string }>('/brainstorm', {
      method: 'POST',
      body: JSON.stringify({ keywords }),
    });
  }

  public async startResearch(agentId: string, handle: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/agents/${agentId}/start-research`, {
        method: 'POST',
        body: JSON.stringify({ handle }),
    });
  }
}

export const apiService = new ApiService();