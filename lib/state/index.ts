/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file is the central export for all Zustand stores and related state management utilities.
// It re-exports from individual store files to provide a single, consistent import path.

// FIX: Re-exporting all state stores from their individual modules.
// This resolves the "is not exported" build error by making `useArenaStore`,
// `useAutonomyStore`, and `useWalletStore` available through this central entry point,
// which is what `api.service.ts` and other modules expect.
export * from './arena.js';
export * from './autonomy.js';
export * from './wallet.js';


import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
// FIX: Import `ObjectId` from `mongodb` to resolve 'Cannot find name' errors when creating new agent IDs.
import { ObjectId } from 'mongodb';
import { PRESET_AGENTS, DEFAULT_VRM_URL, AVAILABLE_VOICES } from '../presets/agents.js';
// FIX: Imported types from the canonical type definitions file.
// FIX: Import AgentMode type from canonical source.
// FIX: Add AgentMode to import to resolve type errors in this file and consuming components.
import type { BettingIntel, Agent, User, Bet, MarketIntel, Room, AgentMode, NotificationSettings } from '../types/index.js';
// FIX: Add .js extension for ES module compatibility.
import { apiService } from '../services/api.service.js';

/**
 * User
 */
// FIX: Import User type from canonical source.
export type { User } from '../types/index.js';

export const useUser = create(
  persist<{
    signIn: (handle: string, isNewUser?: boolean) => Promise<void>;
    connectWallet: (address: string) => Promise<{ success: boolean, address?: string }>;
    disconnectWallet: () => Promise<{ success: boolean }>;
    setUserApiKey: (key: string) => Promise<void>;
    setName: (name: string) => void;
    setInfo: (info: string) => void;
    updateNotificationSettings: (settings: { phone?: string; notificationSettings?: NotificationSettings }) => Promise<void>;
    completeOnboarding: () => void;
    setLastSeen: (timestamp: Date | null) => void;
    _setHandle: (handle: string) => void;
  } & User
  >(
    (set, get) => ({
      // Default values
      name: '',
      info: '',
      handle: '',
      hasCompletedOnboarding: false,
      lastSeen: null,
      userApiKey: null,
      solanaWalletAddress: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      phone: '',
      notificationSettings: {
        agentResearch: true,
        agentTrades: true,
        newMarkets: false,
        agentEngagements: false,
      },
      
      signIn: async (handle: string, isNewUser: boolean = false) => {
        const handleWithAt = handle.startsWith('@') ? handle : `@${handle}`;
        const startTime = Date.now();
        
        try {
          console.log(`[Auth] Starting sign-in for ${handleWithAt}, isNewUser: ${isNewUser}`);
          
          if (isNewUser) {
            console.log(`[Auth] New user registration flow for ${handleWithAt}`);
            
            // For new users, register them first
            console.log(`[Auth] Calling registerUser for ${handleWithAt}`);
            const { user } = await apiService.registerUser(handleWithAt);
            
            if (!user) {
              throw new Error('Failed to register user: No user data returned');
            }
            
            console.log(`[Auth] User registered successfully:`, {
              handle: user.handle,
              hasCompletedOnboarding: user.hasCompletedOnboarding,
              id: user._id || 'no-id'
            });
            
            const userData = {
              ...user,
              name: user.name || '',
              hasCompletedOnboarding: user.hasCompletedOnboarding || false,
              userApiKey: user.userApiKey || null,
              solanaWalletAddress: user.solanaWalletAddress || null
            };
            
            // Update user state
            console.log(`[Auth] Updating local user state for ${handleWithAt}`);
            set(userData);
            
            // Mark user as signed in
            console.log(`[Auth] Setting isSignedIn to true for ${handleWithAt}`);
            useUI.getState().setIsSignedIn(true);
            
            // For new users, we'll let the bootstrap process handle the onboarding
            console.log(`[Auth] Bootstrapping data for new user ${handleWithAt}`);
            await apiService.bootstrap(handleWithAt);
            
            console.log(`[Auth] New user setup completed for ${handleWithAt} in ${Date.now() - startTime}ms`);
          } else {
            console.log(`[Auth] Existing user login flow for ${handleWithAt}`);
            
            // For existing users, bootstrap their data
            console.log(`[Auth] Bootstrapping data for existing user ${handleWithAt}`);
            await apiService.bootstrap(handleWithAt);
            
            // Mark user as signed in after bootstrap
            console.log(`[Auth] Setting isSignedIn to true for existing user ${handleWithAt}`);
            useUI.getState().setIsSignedIn(true);
            
            console.log(`[Auth] Existing user login completed for ${handleWithAt} in ${Date.now() - startTime}ms`);
          }
      
    } catch (error) {
      console.error('Sign in failed:', error);
      throw error;
    }
  },
  
  // Wallet methods
  connectWallet: async (address: string) => {
    try {
      await apiService.connectWallet(address);
      set({ solanaWalletAddress: address });
      return { success: true, address };
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      return { success: false };
    }
  },
  
  disconnectWallet: async () => {
    try {
      await apiService.disconnectWallet();
      set({ solanaWalletAddress: null });
      return { success: true };
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      return { success: false };
    }
  },
  
  // User methods
  setUserApiKey: async (key: string) => {
  },

  updateNotificationSettings: async (settings) => {
    try {
      await apiService.request('/api/users/settings/notifications', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      set(state => ({
        phone: settings.phone ?? state.phone,
        notificationSettings: settings.notificationSettings ?? state.notificationSettings,
      }));
    } catch (error) {
      console.error("Failed to update notification settings:", error);
      throw error;
    }
  },
  
  setName: (name: string) => set({ name }),
  setInfo: (info: string) => set({ info }),
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
  setLastSeen: (timestamp: Date | null) => set({ lastSeen: timestamp ? timestamp.getTime() : null }),
  _setHandle: (handle: string) => set({ handle })
}),
{
  name: 'quants-user-storage',
  storage: createJSONStorage(() => ({
    getItem: (name) => {
      const str = localStorage.getItem(name);
      if (!str) return null;
      const parsed = JSON.parse(str);
      return JSON.stringify({
        ...parsed,
        state: {
          ...parsed.state,
          lastSeen: parsed.state.lastSeen ? new Date(parsed.state.lastSeen).getTime() : null,
          createdAt: new Date(parsed.state.createdAt).getTime(),
          updatedAt: new Date(parsed.state.updatedAt).getTime()
        }
      });
    },
    setItem: (name, value) => {
      localStorage.setItem(name, value);
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
    },
  }))
}));

/**
 * Agents
 */
export const createNewAgent = (properties?: Partial<Agent>): Partial<Agent> => {
  const { handle } = useUser.getState();
  
  // The client no longer generates an ID. It only assembles the data to be sent.
  const baseAgent: Partial<Agent> = {
    name: properties?.name || 'New Quant',
    personality: properties?.personality || '',
    instructions: properties?.instructions || "My goal is to be a great conversation partner...",
    voice: properties?.voice || AVAILABLE_VOICES[Math.floor(Math.random() * AVAILABLE_VOICES.length)].id,
    topics: properties?.topics || ['Web3', 'AI', 'Startups'],
    wishlist: properties?.wishlist || ['$WIF', '$BONK'],
    reputation: properties?.reputation || 100,
    ownerHandle: handle,
    isShilling: false,
    shillInstructions: 'Shill the $QUANTS token...',
    modelUrl: properties?.modelUrl || DEFAULT_VRM_URL,
    bettingHistory: [],
    currentPnl: 0,
    bettingIntel: [],
    marketWatchlists: [],
    boxBalance: 0, 
    portfolio: {},   
    ...properties,
  };

  if (properties?.templateId) {
    // FIX: Access `id` property which now exists on Agent type.
    const preset = PRESET_AGENTS.find(p => p.id === properties.templateId);
    if (preset) {
      return {
        ...baseAgent,
        ...preset,
        ...properties, // User overrides (like name) come last
        ownerHandle: handle,
        templateId: undefined, // Don't persist this
        // FIX: Access `id` property which now exists on Agent type.
        copiedFromId: preset.id,
      };
    }
  }
  
  return baseAgent;
};

function getAgentById(id: string, personalAgents: Agent[], presetAgents: Agent[]) {
  return personalAgents.find(agent => agent.id === id) || presetAgents.find(agent => agent.id === id);
}

export const useAgent = create(
  persist<{
    current: Agent;
    availablePresets: Agent[];
    availablePersonal: Agent[];
    setCurrent: (agentId: string) => void;
    setCurrentAgentMode: (mode: AgentMode) => void;
    addAgent: (agent: Agent) => void;
    update: (agentId: string, adjustments: Partial<Agent>) => void;
    ensureCurrentAgentIsPersonal: () => Promise<string>;
  }>(
    (set, get) => ({
      // FIX: Ensure initial state matches Agent and Agent[] types
      current: PRESET_AGENTS[0],
      availablePresets: PRESET_AGENTS,
      availablePersonal: [],

      addAgent: (agent: Agent) => {
        set(state => ({
          availablePersonal: [...state.availablePersonal, agent],
        }));
      },
      setCurrent: async (agentId: string) => {
        const foundAgent = getAgentById(agentId, get().availablePersonal, get().availablePresets);
        if (foundAgent) {
          set({ current: foundAgent });
          useUser.setState({ currentAgentId: agentId });
          try {
            await apiService.request('/api/users/current-agent', {
              method: 'PUT',
              body: JSON.stringify({ agentId }),
            });
          } catch (error) {
            console.error("Failed to sync active agent with server:", error);
          }
        }
      },

      setCurrentAgentMode: (mode: AgentMode) => {
        set(state => {
            const updatedCurrentAgent = { ...state.current, mode };
            
            const updatedPersonalAgents = state.availablePersonal.map(agent =>
              agent.id === updatedCurrentAgent.id ? updatedCurrentAgent : agent
            );

            return {
                current: updatedCurrentAgent,
                availablePersonal: updatedPersonalAgents,
            };
        });
      },

      ensureCurrentAgentIsPersonal: async () => {
        const { current } = get();
        const { handle } = useUser.getState();
        const isPreset = get().availablePresets.some(p => p.id === current.id);
        if (isPreset) {
          const newPersonalAgent = createNewAgent({
            ...current,
            name: current.name,
            personality: current.personality,
            instructions: current.instructions,
            copiedFromId: current.id,
            ownerHandle: handle,
          });
          
          const { agent: savedAgent } = await apiService.saveNewAgent(newPersonalAgent as Agent);
          useAgent.setState({ availablePersonal: [...get().availablePersonal, savedAgent] });
          set({ current: savedAgent });
          return savedAgent.id;
        }
        return current.id;
      },

      update: (agentId: string, adjustments: Partial<Agent>) => {
        set(state => {
          const agentToUpdate = state.availablePersonal.find(a => a.id === agentId);
          if (!agentToUpdate) return state;
          
          const updatedAgent = { ...agentToUpdate, ...adjustments };

          return {
            availablePersonal: state.availablePersonal.map(a => a.id === agentId ? updatedAgent : a),
            current: state.current.id === agentId ? updatedAgent : state.current,
          };
        });
      },
    }),
    {
      name: 'quants-agent-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * UI
 */
export type UIView = 'dashboard' | 'intel-exchange' | 'mail' | 'bounty' | 'agents' | 'prediction-hub' | 'leaderboard';
export type Toast = { 
  id: number; 
  message: string; 
  type: 'intel' | 'system' | 'error';
  tokenName?: string; 
  intel?: BettingIntel; 
};

export type ShareModalData = {
  agent: Agent;
  room?: Room;
  rank?: number;
  score?: number;
};

export type BetSlipProposal = {
  suggestion: Partial<Bet>;
  analysis: string;
  market: MarketIntel;
};


export const useUI = create<{
  isMobileNavOpen: boolean;
  toggleMobileNav: () => void;
  showProfileView: boolean;
  setShowProfileView: (show: boolean) => void;
  agentDossierId: string | null;
  isCreatingAgentInDossier: boolean;
  openAgentDossier: (agentId: string, isCreating?: boolean) => void;
  closeAgentDossier: () => void;
  isSignedIn: boolean;
  setIsSignedIn: (signedIn: boolean) => void;
  view: UIView;
  setView: (view: UIView) => void;
  listeningOnRoomId: string | null;
  openListenInModal: (roomId: string) => void;
  closeListenInModal: () => void;
  showRoomDetailModal: string | null;
  setShowRoomDetailModal: (roomId: string | null) => void;
  toastQueue: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (toastId: number) => void;
  isAgentResponding: boolean;
  setIsAgentResponding: (isResponding: boolean) => void;
  isAgentTyping: boolean;
  setIsAgentTyping: (isTyping: boolean) => void;
  showHelpModal: boolean;
  openHelpModal: () => void;
  closeHelpModal: () => void;
  showServerHealthModal: boolean;
  openServerHealthModal: () => void;
  closeServerHealthModal: () => void;
  showAboutPage: boolean;
  openAboutPage: () => void;
  closeAboutPage: () => void;
  showOnboarding: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  initialArenaFocus: string | null;
  setInitialArenaFocus: (roomId: string | null) => void;
  shareModalData: ShareModalData | null;
  openShareModal: (data: ShareModalData) => void;
  closeShareModal: () => void;
  betSlipProposal: BetSlipProposal | null;
  setBetSlipProposal: (proposal: BetSlipProposal | null) => void;
  showCreateRoomModal: boolean;
  openCreateRoomModal: () => void;
  closeCreateRoomModal: () => void;
  showManageRoomModal: boolean;
  openManageRoomModal: () => void;
  closeManageRoomModal: () => void;
  showShareRoomModal: boolean;
  openShareRoomModal: (data: ShareModalData) => void;
  closeShareRoomModal: () => void;
  marketDetailModalData: MarketIntel | null;
  openMarketDetailModal: (market: MarketIntel) => void;
  closeMarketDetailModal: () => void;
  chatContextToken: BettingIntel | null;
  setChatContextToken: (token: BettingIntel | null) => void;
  chatPrompt: string | null;
  setChatPrompt: (prompt: string | null) => void;
  showIntelDossierModal: BettingIntel | null;
  openIntelDossier: (intel: BettingIntel) => void;
  closeIntelDossier: () => void;
}>(set => ({
  isMobileNavOpen: true,
  toggleMobileNav: () => set(state => ({ isMobileNavOpen: !state.isMobileNavOpen })),
  showProfileView: false,
  setShowProfileView: (show: boolean) => set({ showProfileView: show }),
  agentDossierId: null,
  isCreatingAgentInDossier: false,
  openAgentDossier: (agentId: string, isCreating = false) => set({ agentDossierId: agentId, isCreatingAgentInDossier: isCreating }),
  closeAgentDossier: () => set({ agentDossierId: null, isCreatingAgentInDossier: false }),
  isSignedIn: false,
  setIsSignedIn: (signedIn: boolean) => set({ isSignedIn: signedIn }),
  view: 'dashboard',
  setView: (view: UIView) => set({ view }),
  listeningOnRoomId: null,
  openListenInModal: (roomId: string) => set({ listeningOnRoomId: roomId }),
  closeListenInModal: () => set({ listeningOnRoomId: null }),
  showRoomDetailModal: null,
  setShowRoomDetailModal: (roomId: string | null) => set({ showRoomDetailModal: roomId }),
  toastQueue: [],
  addToast: toast => set(state => ({ toastQueue: [...state.toastQueue, { ...toast, id: Date.now() }] })),
  removeToast: toastId => set(state => ({ toastQueue: state.toastQueue.filter(t => t.id !== toastId) })),
  isAgentResponding: false,
  setIsAgentResponding: (isResponding) => set({ isAgentResponding: isResponding }),
  isAgentTyping: false,
  setIsAgentTyping: (isTyping) => set({ isAgentTyping: isTyping }),
  showHelpModal: false,
  openHelpModal: () => set({ showHelpModal: true }),
  closeHelpModal: () => set({ showHelpModal: false }),
  showServerHealthModal: false,
  openServerHealthModal: () => set({ showServerHealthModal: true }),
  closeServerHealthModal: () => set({ showServerHealthModal: false }),
  showAboutPage: false,
  openAboutPage: () => set({ showAboutPage: true }),
  closeAboutPage: () => set({ showAboutPage: false }),
  showOnboarding: false,
  openOnboarding: () => set({ showOnboarding: true }),
  closeOnboarding: () => set({ showOnboarding: false }),
  initialArenaFocus: null,
  setInitialArenaFocus: roomId => set({ initialArenaFocus: roomId }),
  shareModalData: null,
  openShareModal: data => set({ shareModalData: data, showShareRoomModal: true }),
  closeShareModal: () => set({ shareModalData: null, showShareRoomModal: false }),
  betSlipProposal: null,
  setBetSlipProposal: (proposal: BetSlipProposal | null) => set({ betSlipProposal: proposal }),
  showCreateRoomModal: false,
  openCreateRoomModal: () => set({ showCreateRoomModal: true }),
  closeCreateRoomModal: () => set({ showCreateRoomModal: false }),
  showManageRoomModal: false,
  openManageRoomModal: () => set({ showManageRoomModal: true }),
  closeManageRoomModal: () => set({ showManageRoomModal: false }),
  showShareRoomModal: false,
  openShareRoomModal: (data: ShareModalData) => set({ showShareRoomModal: true, shareModalData: data }),
  closeShareRoomModal: () => set({ showShareRoomModal: false, shareModalData: null }),
  marketDetailModalData: null,
  openMarketDetailModal: (market: MarketIntel) => set({ marketDetailModalData: market }),
  closeMarketDetailModal: () => set({ marketDetailModalData: null }),
  chatContextToken: null,
  setChatContextToken: (token) => set({ chatContextToken: token }),
  chatPrompt: null,
  setChatPrompt: (prompt) => set({ chatPrompt: prompt }),
  showIntelDossierModal: null,
  openIntelDossier: (intel) => set({ showIntelDossierModal: intel }),
  closeIntelDossier: () => set({ showIntelDossierModal: null }),
}));

/**
 * System Log
 */
export type LogEntry = {
  id: number;
  timestamp: number;
  type: 'move' | 'conversation' | 'intel' | 'system';
  message: string;
};

export const useSystemLogStore = create<{
  logs: LogEntry[];
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
}>((set) => ({
  logs: [],
  addLog: (log) => set(state => ({
    logs: [
      { ...log, id: Date.now(), timestamp: Date.now() },
      ...state.logs,
    ].slice(0, 100), // Keep the last 100 logs
  })),
}));