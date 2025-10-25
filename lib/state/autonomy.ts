/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { useWalletStore } from './wallet.js';
// FIX: Imported types from the canonical types file.
import { AgentActivity, BettingIntel, Bounty } from '../types/index.js';

interface ServerHydrationData {
    bounties: Bounty[];
    intel: BettingIntel[];
}

export type AutonomyState = {
  activity: AgentActivity;
  statusMessage: string;
  intelBank: BettingIntel[];
  bounties: Bounty[];
  lastActivity: Record<string, number>;
  isAutonomyEnabled: boolean;
  gatherIntelCooldown: number;
  researchIntelCooldown: number;
  hydrate: (data: ServerHydrationData) => void;
  setActivity: (activity: AgentActivity, message?: string) => void;
  setLastActivity: (activity: AgentActivity, timestamp: number) => void;
  addIntelFromConversation: (
    intel: Partial<BettingIntel>,
    bountyId?: string,
  ) => void;
  addIntelFromSocket: (intel: BettingIntel) => void;
  addIntelBatch: (intelItems: Partial<BettingIntel>[]) => void;
  updateIntel: (intelId: string, updates: Partial<BettingIntel>) => void;
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
          statusMessage = 'Scanning prediction markets...';
          break;
        case 'RESEARCHING_INTEL':
          statusMessage = 'Analyzing betting intel...';
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
    intel: Partial<BettingIntel>,
    bountyId,
  ) => {
    set(state => {
      if (
        state.intelBank.some(
          item => item.id === intel.id,
        )
      ) {
        return state;
      }

      const newIntel: BettingIntel = {
        id: `bettingintel-${Math.random().toString(36).substring(2, 9)}`,
        createdAt: Date.now(),
        market: intel.market || 'UNKNOWN',
        content: intel.content || '',
        sourceDescription: intel.sourceDescription || 'Conversation',
        ...intel,
        pnlGenerated: { amount: 0, currency: 'USD' },
        bountyId: bountyId,
      } as BettingIntel;

      if (bountyId) {
        get().completeBounty(bountyId);
      }
      return { intelBank: [newIntel, ...state.intelBank] };
    });
  },

  addIntelFromSocket: (intel: BettingIntel) => {
    set(state => {
       if (state.intelBank.some(item => item.id === intel.id)) {
        return state; // Avoid duplicates
      }
      return { intelBank: [intel, ...state.intelBank] };
    });
  },

  addIntelBatch: (intelItems: Partial<BettingIntel>[]) => {
    set(state => {
      const existingIds = new Set(state.intelBank.map(item => item.id));
      const newItems = intelItems.filter(
        item => item.id && !existingIds.has(item.id),
      );
      if (newItems.length === 0) return state;
      return { intelBank: [...(newItems as BettingIntel[]), ...state.intelBank] };
    });
  },

  updateIntel: (intelId: string, updates: Partial<BettingIntel>) => {
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
      console.error("Attempted to add bounty with insufficient funds.");
      // The UI component calling this should handle the user feedback (e.g., alert).
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
    const intelFound: Partial<BettingIntel>[] = [];
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