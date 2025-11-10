import { create } from 'zustand';

export type PaywallDetails = {
  url: string;
  price: string;
  payTo: string;
  network: 'Solana' | 'Base';
  description: string;
  onSuccess: (signature: string) => void;
};

type PaywallState = {
  isOpen: boolean;
  details: PaywallDetails | null;
  openPaywall: (details: PaywallDetails) => void;
  closePaywall: () => void;
};

export const usePaywallStore = create<PaywallState>((set) => ({
  isOpen: false,
  details: null,
  openPaywall: (details) => set({ isOpen: true, details }),
  closePaywall: () => set({ isOpen: false, details: null }),
}));
