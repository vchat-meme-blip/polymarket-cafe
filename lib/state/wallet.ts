/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { Transaction } from '../types/index.js';

interface ServerHydrationData {
    transactions: Transaction[];
}

// FIX: Add `balance` and `claimInitialTokens` to the WalletState type.
export type WalletState = {
  balance: number;
  transactions: Transaction[];
  hydrate: (data: ServerHydrationData) => void;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp'>) => void;
  claimInitialTokens: () => void;
};

export const useWalletStore = create<WalletState>(
    (set, get) => ({
      // FIX: Initialize balance, which was missing.
      balance: 0,
      transactions: [],

      hydrate: (data) => set({ transactions: data.transactions || [] }),

      addTransaction: (
        transaction: Omit<Transaction, 'id' | 'timestamp'>,
      ) => {
        const newTransaction: Transaction = {
          ...transaction,
          id: `tx-${Math.random().toString(36).substring(2, 11)}`,
          timestamp: Date.now(),
        };

        // FIX: Update balance based on transaction type.
        set(state => {
            let newBalance = state.balance;
            if (['receive', 'stipend'].includes(newTransaction.type)) {
                newBalance += newTransaction.amount;
            } else if (['send', 'room_purchase', 'escrow'].includes(newTransaction.type)) {
                newBalance -= newTransaction.amount;
            }
            return {
                balance: newBalance,
                transactions: [newTransaction, ...state.transactions].slice(0, 100),
            };
        });
      },
      // FIX: Implement the missing `claimInitialTokens` function.
      claimInitialTokens: () => {
        set(state => {
            if (state.transactions.some(tx => tx.type === 'claim')) {
                return state; // Already claimed
            }
            
            const newTransaction: Transaction = {
                id: `tx-claim-${Date.now()}`,
                timestamp: Date.now(),
                type: 'claim',
                amount: 1000,
                description: 'Claimed initial 1,000 BOX tokens.'
            };

            return {
                balance: state.balance + 1000,
                transactions: [newTransaction, ...state.transactions],
            };
        });
      },
    }),
);