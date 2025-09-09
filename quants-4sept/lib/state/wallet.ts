/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { isToday, startOfToday } from 'date-fns';

export type TransactionType = 'claim' | 'send' | 'receive' | 'stipend';

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  timestamp: number;
};

interface ServerHydrationData {
    transactions: Transaction[];
}

export type WalletState = {
  balance: number;
  transactions: Transaction[];
  lastClaimedStipend: number | null;
  hydrate: (data: ServerHydrationData) => void;
  claimInitialTokens: () => void;
  claimDailyStipend: () => void;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp'>) => void;
};

export const useWalletStore = create(
  persist<WalletState>(
    (set, get) => ({
      balance: 0,
      transactions: [],
      lastClaimedStipend: null,

      hydrate: (data) => set(state => {
        // Recalculate balance based on server transaction history
        const balance = data.transactions.reduce((acc, tx) => {
            if (tx.type === 'send') return acc - tx.amount;
            return acc + tx.amount;
        }, 0);
        return { transactions: data.transactions, balance };
      }),

      claimInitialTokens: () => {
        if (get().transactions.some(tx => tx.type === 'claim')) {
          return;
        }
        const claimAmount = 1000;
        get().addTransaction({
          type: 'claim',
          amount: claimAmount,
          description: 'Claimed initial BOX tokens.',
        });
      },

      claimDailyStipend: () => {
        const { lastClaimedStipend } = get();
        if (lastClaimedStipend && isToday(lastClaimedStipend)) {
          return;
        }
        const stipendAmount = 100;
        get().addTransaction({
          type: 'stipend',
          amount: stipendAmount,
          description: 'Received daily BOX stipend.',
        });
        set({ lastClaimedStipend: startOfToday().getTime() });
      },

      addTransaction: (
        transaction: Omit<Transaction, 'id' | 'timestamp'>,
      ) => {
        const newTransaction: Transaction = {
          ...transaction,
          id: `tx-${Math.random().toString(36).substring(2, 11)}`,
          timestamp: Date.now(),
        };

        set(state => ({
          transactions: [newTransaction, ...state.transactions].slice(0, 100),
        }));

        if (transaction.type === 'send') {
          set(state => ({ balance: state.balance - transaction.amount }));
        } else if (
          transaction.type === 'receive' ||
          transaction.type === 'claim' ||
          transaction.type === 'stipend'
        ) {
          set(state => ({ balance: state.balance + transaction.amount }));
        }
      },
    }),
    {
      name: 'quants-wallet-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
