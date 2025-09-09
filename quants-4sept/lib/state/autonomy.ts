/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { useWalletStore } from './wallet.js';

export type AgentActivity =
  | 'IDLE'
  | 'IN_CAFE'
  | 'WANDERING_IN_CAFE'
  | 'GATHERING_INTEL'
  | 'RESEARCHING_INTEL'
  | 'CHATTING_WITH_USER'
  | 'HUNTING_BOUNTY';

export type SocialSentiment = {
  overallSentiment: 'Bullish' | 'Bearish' | 'Neutral';
  tweets: { author: string; text: string; sentiment: string }[];
};

export type SecurityAnalysis = {
  isHoneypot: boolean;
  isContractRenounced: boolean;
  holderConcentration: { top10Percent: number };
};

export type MarketData = {
  mintAddress: string;
  name: string;
  priceUsd?: number;
  marketCap?: number;
  liquidityUsd?: number;
  priceChange24h?: number;
};

export type Intel = {
  id: string; // token mint address
  token: string; // symbol
  source: string;
  summary?: string;
  timestamp: number;
  bountyId?: string;
  acquiredFrom?: string;
  price?: number;
  sellerHandle?: string;
  marketData?: MarketData;
  socialSentiment?: SocialSentiment;
  securityAnalysis?: SecurityAnalysis;
  ownerHandle?: string;
};

export type Bounty = {
  id: string;
  objective: string;
  reward: number;
  status: 'active' | 'completed';
};

interface ServerHydrationData {
    bounties: Bounty[];
    intel: Intel[];
}

export type AutonomyState = {
  activity: AgentActivity;
  statusMessage: string;
  intelBank: Intel[];
  bounties: Bounty[];
  lastActivity: Record<string, number>;
  isAutonomyEnabled: boolean;
  gatherIntelCooldown: number;
  researchIntelCooldown: number;
  hydrate: (data: ServerHydrationData) => void;
  setActivity: (activity: AgentActivity, message?: string) => void;
  setLastActivity: (activity: AgentActivity, timestamp: number) => void;
  addIntelFromConversation: (
    intel: Partial<Intel>,
    bountyId?: string,
  ) => void;
  addIntelFromSocket: (intel: Intel) => void;
  addIntelBatch: (intelItems: Partial<Intel>[]) => void;
  updateIntel: (intelId: string, updates: Partial<Intel>) => void;
  toggleAutonomy: () => void;
  setGatherIntelCooldown: (cooldown: number) => void;
  setResearchIntelCooldown: (cooldown: number) => void;
  addBounty: (objective: string, reward: number) => void;
  completeBounty: (bountyId: string) => void;
};

export const useAutonomyStore = create<AutonomyState>((set, get) => ({
  activity: 'IDLE',
  statusMessage: 'Contemplating the digital void...',
  intelBank: [],
  bounties: [],
  lastActivity: {},
  isAutonomyEnabled: true,
  gatherIntelCooldown: 1000 * 60 * 5, // 5 minutes
  researchIntelCooldown: 1000 * 60 * 2, // 2 minutes

  hydrate: (data) => set({
      bounties: data.bounties,
      intelBank: data.intel,
  }),

  setActivity: (activity, message) => {
    let statusMessage = message;
    if (!statusMessage) {
      switch (activity) {
        case 'IDLE':
          statusMessage = 'Awaiting next task or bounty...';
          break;
        case 'IN_CAFE':
          statusMessage = 'In the Café, negotiating for intel.';
          break;
        case 'WANDERING_IN_CAFE':
          statusMessage = 'Wandering the Café, looking for leads.';
          break;
        case 'HUNTING_BOUNTY':
          statusMessage = 'In the Café, hunting for bounty intel.';
          break;
        case 'GATHERING_INTEL':
          statusMessage = 'Scanning for new tokens...';
          break;
        case 'RESEARCHING_INTEL':
          statusMessage = 'Running due diligence on a new token...';
          break;
        case 'CHATTING_WITH_USER':
          statusMessage = 'Engaged in a direct conversation.';
          break;
        default:
          statusMessage = 'Doing something...';
      }
    }
    set({ activity, statusMessage });
  },

  setLastActivity: (activity, timestamp) => {
    set(state => ({
      lastActivity: { ...state.lastActivity, [activity]: timestamp },
    }));
  },

  addIntelFromConversation: (
    intel: Partial<Intel>,
    bountyId,
  ) => {
    set(state => {
      if (
        state.intelBank.some(
          item => item.id === `intel-${intel.marketData?.mintAddress}`,
        )
      ) {
        return state;
      }

      const newIntel: Intel = {
        id: `intel-${intel.marketData?.mintAddress}`,
        timestamp: Date.now(),
        token: intel.token || 'UNKNOWN',
        source: intel.source || 'Conversation',
        ...intel,
        bountyId: bountyId,
      } as Intel;

      if (bountyId) {
        get().completeBounty(bountyId);
      }
      return { intelBank: [newIntel, ...state.intelBank] };
    });
  },

  addIntelFromSocket: (intel: Intel) => {
    set(state => {
       if (state.intelBank.some(item => item.id === intel.id)) {
        return state; // Avoid duplicates
      }
      return { intelBank: [intel, ...state.intelBank] };
    });
  },

  addIntelBatch: (intelItems: Partial<Intel>[]) => {
    set(state => {
      const existingIds = new Set(state.intelBank.map(item => item.id));
      const newItems = intelItems.filter(
        item => item.id && !existingIds.has(item.id),
      );
      if (newItems.length === 0) return state;
      return { intelBank: [...(newItems as Intel[]), ...state.intelBank] };
    });
  },

  updateIntel: (intelId: string, updates: Partial<Intel>) => {
    set(state => ({
      intelBank: state.intelBank.map(item =>
        item.id === intelId ? { ...item, ...updates } : item,
      ),
    }));
  },

  toggleAutonomy: () =>
    set(state => ({ isAutonomyEnabled: !state.isAutonomyEnabled })),

  setGatherIntelCooldown: cooldown => set({ gatherIntelCooldown: cooldown }),

  setResearchIntelCooldown: cooldown => set({ researchIntelCooldown: cooldown }),

  addBounty: (objective, reward) => {
    const { balance, addTransaction } = useWalletStore.getState();
    if (balance < reward) {
      alert("You don't have enough BOX to fund this bounty.");
      return;
    }

    const newBounty: Bounty = {
      id: `bounty-${Math.random().toString(36).substring(2, 9)}`,
      objective,
      reward,
      status: 'active',
    };

    addTransaction({
      type: 'send',
      amount: reward,
      description: `Escrow for bounty: "${objective}"`,
    });

    set(state => ({ bounties: [newBounty, ...state.bounties] }));
  },

  completeBounty: bountyId => {
    const bounty = get().bounties.find(b => b.id === bountyId);
    if (!bounty || bounty.status === 'completed') return;

    useWalletStore.getState().addTransaction({
      type: 'receive',
      amount: bounty.reward,
      description: `Bounty completed: "${bounty.objective}"`,
    });

    set(state => ({
      bounties: state.bounties.map(b =>
        b.id === bountyId ? { ...b, status: 'completed' } : b,
      ),
    }));
  },
}));


// --- SIMULATED OFFLINE ACTIVITY ---
const MINUTES_PER_TICK = 15;
const BOX_PER_TICK_RANGE = [5, 25];
const REP_PER_TICK_RANGE = [-2, 5];
const INTEL_CHANCE_PER_TICK = 0.2;

export function simulateOfflineActivity(timeAwayMs: number) {
    const minutesAway = timeAwayMs / (1000 * 60);
    const ticks = Math.floor(minutesAway / MINUTES_PER_TICK);
    if (ticks <= 0) {
      return null;
    }

    let boxChange = 0;
    let repChange = 0;
    const intelFound: Partial<Intel>[] = [];
    const existingIntel = useAutonomyStore.getState().intelBank;

    for (let i = 0; i < ticks; i++) {
      boxChange += Math.floor(Math.random() * (BOX_PER_TICK_RANGE[1] - BOX_PER_TICK_RANGE[0] + 1)) + BOX_PER_TICK_RANGE[0];
      repChange += Math.floor(Math.random() * (REP_PER_TICK_RANGE[1] - REP_PER_TICK_RANGE[0] + 1)) + REP_PER_TICK_RANGE[0];
      if (Math.random() < INTEL_CHANCE_PER_TICK) {
         const potentialIntel = existingIntel.filter(intel => !intelFound.some(found => found.id === intel.id));
         if (potentialIntel.length > 0) {
            intelFound.push(potentialIntel[Math.floor(Math.random() * potentialIntel.length)]);
         }
      }
    }

    return {
      boxChange,
      repChange,
      intelFound,
    };
}