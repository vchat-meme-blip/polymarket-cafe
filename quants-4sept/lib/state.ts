/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Agent, PRESET_AGENTS, DEFAULT_VRM_URL, INTERLOCUTOR_VOICE } from './presets/agents.js';
import { Intel } from './state/autonomy.js';
import { apiService } from './services/api.service.js';

/**
 * User
 */
export type User = {
  _id?: string; // MongoDB ID
  name?: string;
  info?: string;
  handle?: string;
  hasCompletedOnboarding: boolean;
  lastSeen: number | null;
  solanaWalletAddress: string | null;
  userApiKey: string | null;
};

export const useUser = create(
  persist<
    {
      signIn: (handle: string) => Promise<void>;
      connectWallet: (address: string) => Promise<void>;
      disconnectWallet: () => Promise<void>;
      setUserApiKey: (key: string) => Promise<void>;
      setName: (name: string) => void;
      setInfo: (info: string) => void;
      completeOnboarding: () => void;
      setLastSeen: (timestamp: number) => void;
      _setHandle: (handle: string) => void;
    } & User
  >(
    (set, get) => ({
      name: '',
      info: '',
      handle: '',
      hasCompletedOnboarding: false,
      lastSeen: null,
      solanaWalletAddress: null,
      userApiKey: null,
      
      signIn: async (handle: string) => {
        const handleWithAt = handle.startsWith('@') ? handle : `@${handle}`;
        await apiService.bootstrap(handleWithAt);
      },
      connectWallet: async (address: string) => {
        await apiService.connectWallet(address);
      },
      disconnectWallet: async () => {
        await apiService.disconnectWallet();
      },
      setUserApiKey: async (key: string) => {
        await apiService.saveApiKey(key);
      },
      
      setName: name => set({ name }),
      setInfo: info => set({ info }),
      completeOnboarding: () => {
        const handle = get().handle;
        set({ hasCompletedOnboarding: true });
        if (handle) {
          apiService.syncOnboardingComplete(handle);
        }
      },
      setLastSeen: timestamp => set({ lastSeen: timestamp }),

      _setHandle: (handle: string) => {
        set({ handle, hasCompletedOnboarding: false, name: '', info: '' });
      },
    }),
    {
      name: 'chatterbox-user-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * Agents
 */
export const createNewAgent = (properties?: Partial<Agent>): Agent => {
  const { handle } = useUser.getState();
  return {
    id: Math.random().toString(36).substring(2, 15),
    name: '',
    personality: '',
    instructions: "My goal is to be a great conversation partner...",
    voice: Math.random() > 0.5 ? 'Charon' : 'Aoede',
    topics: ['Web3', 'AI', 'Startups'],
    wishlist: ['$WIF', '$BONK'],
    reputation: 100,
    ownerHandle: handle,
    isShilling: false,
    shillInstructions: 'Shill the $QUANTS token...',
    modelUrl: DEFAULT_VRM_URL,
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
        // The call to register the agent in the arena is now handled by the api.service
        // to break the circular dependency between state.ts and arena.ts.
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
      name: 'chatterbox-agent-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * UI
 */
export type UIView = 'dashboard' | 'arena' | 'mail' | 'bounty' | 'agents';
export type Toast = { id: number; message: string; tokenName: string; intel: Intel; };

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
}));