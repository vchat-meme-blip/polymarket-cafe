/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PRESET_AGENTS, DEFAULT_VRM_URL, AVAILABLE_VOICES } from '../presets/agents.js';
import type { Intel, Agent } from '../types/index.js';
import { apiService } from '../services/api.service.js';

/**
 * User
 */
export type User = {
  _id?: any; // MongoDB ID
  name: string;
  info: string;
  handle: string;
  hasCompletedOnboarding: boolean;
  lastSeen: number | null;
  createdAt: number;
  updatedAt: number;
  userApiKey: string | null;
  solanaWalletAddress: string | null;
};

export const useUser = create(
  persist<{
    signIn: (handle: string, isNewUser?: boolean) => Promise<void>;
    connectWallet: (address: string) => Promise<{ success: boolean, address?: string }>;
    disconnectWallet: () => Promise<{ success: boolean }>;
    setUserApiKey: (key: string) => Promise<void>;
    setName: (name: string) => void;
    setInfo: (info: string) => void;
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
      return { success: true, address };
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      return { success: false };
    }
  },
  
  disconnectWallet: async () => {
    try {
      await apiService.disconnectWallet();
      return { success: true };
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      return { success: false };
    }
  },
  
  // User methods
  setUserApiKey: async (key: string) => {
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
export const createNewAgent = (properties?: Partial<Agent>): Agent => {
  const { handle } = useUser.getState();
  
  if (properties?.templateId) {
    const preset = PRESET_AGENTS.find(p => p.id === properties.templateId);
    if (preset) {
      return {
        ...preset,
        ...properties,
        id: Math.random().toString(36).substring(2, 15),
        ownerHandle: handle,
        isShilling: false,
        shillInstructions: 'Shill the $QUANTS token...',
        topics: preset.topics || properties.topics || ['Web3', 'AI', 'Startups'],
        wishlist: preset.wishlist || properties.wishlist || ['$WIF', '$BONK'],
        templateId: undefined,
        boxBalance: 500,
        portfolio: {},
      };
    }
  }
  
  return {
    id: Math.random().toString(36).substring(2, 15),
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
    boxBalance: 500,
    portfolio: {},
    ...properties,
  };
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
    addAgent: (agent: Agent) => void;
    update: (agentId: string, adjustments: Partial<Agent>) => void;
    ensureCurrentAgentIsPersonal: () => Promise<string>;
  }>(
    (set, get) => ({
      current: PRESET_AGENTS[0],
      availablePresets: PRESET_AGENTS,
      availablePersonal: [],

      addAgent: (agent: Agent) => {
        set(state => ({
          availablePersonal: [...state.availablePersonal, agent],
        }));
      },
      setCurrent: (agentId: string) => {
        const foundAgent = getAgentById(agentId, get().availablePersonal, get().availablePresets);
        if (foundAgent) {
          set({ current: foundAgent });
        }
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
            id: `personal-${Math.random().toString(36).substring(2, 9)}`,
            copiedFromId: current.id,
            ownerHandle: handle,
          });
          
          const { agent: savedAgent } = await apiService.saveNewAgent(newPersonalAgent);
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
export type UIView = 'dashboard' | 'arena' | 'mail' | 'bounty' | 'agents' | 'trading-floor' | 'leaderboard';
export type Toast = { 
  id: number; 
  message: string; 
  type: 'intel' | 'system' | 'error';
  tokenName?: string; 
  intel?: Intel; 
};

export type ShareModalData = {
  agent: Agent;
  rank: number;
  score: number;
};

export const useUI = create<{
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
  showIntelDossier: Intel | null;
  openIntelDossier: (intel: Intel) => void;
  closeIntelDossier: () => void;
  toastQueue: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (toastId: number) => void;
  isAgentResponding: boolean;
  setIsAgentResponding: (isResponding: boolean) => void;
  chatContextToken: Intel | null;
  setChatContextToken: (intel: Intel | null) => void;
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
}>(set => ({
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
  showIntelDossier: null,
  openIntelDossier: (intel: Intel) => set({ showIntelDossier: intel }),
  closeIntelDossier: () => set({ showIntelDossier: null }),
  toastQueue: [],
  addToast: toast => set(state => ({ toastQueue: [...state.toastQueue, { ...toast, id: Date.now() }] })),
  removeToast: toastId => set(state => ({ toastQueue: state.toastQueue.filter(t => t.id !== toastId) })),
  isAgentResponding: false,
  setIsAgentResponding: (isResponding) => set({ isAgentResponding: isResponding }),
  chatContextToken: null,
  setChatContextToken: intel => set({ chatContextToken: intel }),
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
  openShareModal: data => set({ shareModalData: data }),
  closeShareModal: () => set({ shareModalData: null }),
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