/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { useWalletStore } from './wallet.js';
import { AgentActivity, BettingIntel, AgentTask, ActivityLogEntry } from '../types/index.js';
import { apiService } from '../services/api.service.js';
import { useAgent } from './index.js';

interface ServerHydrationData {
    intel: BettingIntel[];
    activityLog: ActivityLogEntry[];
    tasks: AgentTask[];
}

export type AutonomyState = {
  activity: AgentActivity;
  statusMessage: string;
  intelBank: BettingIntel[];
  tasks: AgentTask[];
  activityLog: ActivityLogEntry[];
  lastActivity: Record<string, number>;
  gatherIntelCooldown: number;
  researchIntelCooldown: number;
  hydrate: (data: ServerHydrationData) => void;
  setActivity: (activity: AgentActivity, message?: string) => void;
  setLastActivity: (activity: AgentActivity, timestamp: number) => void;
  addIntelFromSocket: (intel: BettingIntel) => void;
  addIntelBatch: (intelItems: Partial<BettingIntel>[]) => void;
  updateIntel: (intelId: string, updates: Partial<BettingIntel>) => void;
  setGatherIntelCooldown: (cooldown: number) => void;
  setResearchIntelCooldown: (cooldown: number) => void;
  setTasks: (tasks: AgentTask[]) => void;
  addTask: (task: AgentTask) => void;
  updateTask: (taskId: string, updates: Partial<AgentTask>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  addActivityLog: (logEntry: ActivityLogEntry) => void;
};

export const useAutonomyStore = create<AutonomyState>((set, get) => ({
  activity: 'IDLE',
  statusMessage: 'Contemplating the digital void...',
  intelBank: [],
  tasks: [],
  activityLog: [],
  lastActivity: {},
  gatherIntelCooldown: 1000 * 60 * 5, // 5 minutes
  researchIntelCooldown: 1000 * 60 * 2, // 2 minutes

  hydrate: (data) => set({
      intelBank: data.intel,
      activityLog: data.activityLog || [],
      tasks: data.tasks || [],
  }),

  setActivity: (activity, message) => {
    let statusMessage = message;
    if (!statusMessage) {
      switch (activity) {
        case 'IDLE':
          statusMessage = 'Awaiting next task...';
          break;
        case 'IN_CAFE':
          statusMessage = 'In the Café, negotiating for intel.';
          break;
        case 'WANDERING_IN_CAFE':
          statusMessage = 'Wandering the Café, looking for leads.';
          break;
        case 'HUNTING_BOUNTY':
          statusMessage = 'In the Café, hunting for intel.';
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

  addIntelFromSocket: (intel: BettingIntel) => {
    set(state => {
       if (state.intelBank.some(item => item.id === intel.id)) {
        return {
            intelBank: state.intelBank.map(item => item.id === intel.id ? { ...item, ...intel } : item)
        };
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

  setGatherIntelCooldown: cooldown => set({ gatherIntelCooldown: cooldown }),

  setResearchIntelCooldown: cooldown => set({ researchIntelCooldown: cooldown }),

  setTasks: (tasks: AgentTask[]) => set({ tasks }),
  addTask: (task: AgentTask) => set(state => ({ tasks: [task, ...state.tasks] })),
  updateTask: async (taskId: string, updates: Partial<AgentTask>) => {
    const agentId = useAgent.getState().current.id;
    const updatedTask = await apiService.updateTask(agentId, taskId, updates);
    set(state => ({
      tasks: state.tasks.map(task => 
        task.id === taskId ? updatedTask : task
      ),
    }));
  },
  deleteTask: async (taskId: string) => {
    const agentId = useAgent.getState().current.id;
    set(state => ({
        tasks: state.tasks.filter(task => task.id !== taskId),
    }));
    await apiService.deleteTask(agentId, taskId);
  },
  addActivityLog: (logEntry: ActivityLogEntry) => set(state => ({
    activityLog: [logEntry, ...state.activityLog].slice(0, 100), // Keep last 100 logs
  })),
}));


// --- SIMULATED OFFLINE ACTIVITY ---
const MINUTES_PER_TICK = 15;
const REP_PER_TICK_RANGE = [-2, 5];
const INTEL_CHANCE_PER_TICK = 0.2;

export function simulateOfflineActivity(timeAwayMs: number) {
    const minutesAway = timeAwayMs / (1000 * 60);
    const ticks = Math.floor(minutesAway / MINUTES_PER_TICK);
    if (ticks <= 0) {
      return null;
    }

    let repChange = 0;
    // FIX: Add boxChange to simulate currency changes during offline activity.
    let boxChange = 0;
    const intelFound: Partial<BettingIntel>[] = [];
    const existingIntel = useAutonomyStore.getState().intelBank;

    for (let i = 0; i < ticks; i++) {
      repChange += Math.floor(Math.random() * (REP_PER_TICK_RANGE[1] - REP_PER_TICK_RANGE[0] + 1)) + REP_PER_TICK_RANGE[0];
      // FIX: Add a small random change to box balance per tick to simulate trading.
      boxChange += Math.floor((Math.random() - 0.45) * 20);
      if (Math.random() < INTEL_CHANCE_PER_TICK) {
         const potentialIntel = existingIntel.filter(intel => !intelFound.some(found => found.id === intel.id));
         if (potentialIntel.length > 0) {
            intelFound.push(potentialIntel[Math.floor(Math.random() * potentialIntel.length)]);
         }
      }
    }

    return {
      repChange,
      intelFound,
      // FIX: Return the calculated boxChange.
      boxChange,
    };
}
