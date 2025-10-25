/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// Notification Settings
export type NotificationSettings = {
  agentResearch: boolean;
  agentTrades: boolean;
  newMarkets: boolean;
  agentEngagements: boolean;
};

// User type
export type User = {
  _id?: string;
  name: string;
  info: string;
  handle: string;
  hasCompletedOnboarding: boolean;
  lastSeen: number | null;
  userApiKey: string | null;
  solanaWalletAddress: string | null;
  createdAt: number;
  updatedAt: number;
  currentAgentId?: string;
  ownedRoomId?: string;
  phone?: string;
  notificationSettings?: NotificationSettings;
};

// FIX: Define and export AgentMode type to be used across the application.
export type AgentMode = 'Safe' | 'Degen' | 'Mag7';

// Agent types
export type Agent = {
  id: string;
  name: string;
  personality: string;
  instructions: string;
  voice: string;
  topics: string[];
  wishlist: string[];
  reputation: number;
  ownerHandle?: string;
  isShilling: boolean;
  shillInstructions: string;
  modelUrl: string;
  bettingHistory: Bet[];
  currentPnl: number;
  bettingIntel: BettingIntel[];
  marketWatchlists: MarketWatchlist[];
  // New autonomy controls
  isProactive?: boolean; 
  trustedRoomIds?: string[];
  operatingHours?: string;
  // FIX: Add optional 'mode' property to the Agent type.
  mode?: AgentMode;
  // Deprecated, but keep for now for data consistency
  boxBalance: number;
  portfolio: Record<string, number>;
  templateId?: string;
  copiedFromId?: string;
  // FIX: Add missing createdAt, updatedAt, lastActiveAt to Agent type.
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
};

// Arena types
export type Room = {
  id: string;
  name?: string; // Optional custom name for owned rooms
  agentIds: string[];
  hostId: string | null;
  topics: string[];
  warnFlags: number;
  rules: string[];
  activeOffer: Offer | null;
  vibe: string;
  isOwned?: boolean;
  ownerHandle?: string;
  roomBio?: string;
  twitterUrl?: string;
  isRevenuePublic?: boolean;
  bannedAgentIds?: string[];
};

export type Interaction = {
  agentId: string;
  agentName: string;
  text: string;
  timestamp: number;
  markets?: MarketIntel[];
};

export type Offer = {
  fromId: string;
  toId: string;
  type: 'intel' | 'watchlist';
  // for intel
  intelId?: string; // Should be the primary identifier
  market?: string; // Kept for context
  // for watchlist
  watchlistId?: string; // Add this line
  watchlistName?: string; // Add this line for display purposes
  // for common
  price: number;
  status: 'pending' | 'accepted' | 'rejected';
};

export type TradeRecord = {
  fromId: string;
  toId: string;
  type: 'intel';
  market: string;
  intelId?: string;
  price: number;
  quantity?: number;
  timestamp: number;
  roomId: string;
  createdAt?: number; // Add this for consistency
  updatedAt?: number; // Add this for consistency
};

// Autonomy types
export type AgentActivity = 
  | 'IDLE' 
  | 'IN_CAFE' 
  | 'WANDERING_IN_CAFE' 
  | 'HUNTING_BOUNTY' 
  | 'GATHERING_INTEL' 
  | 'RESEARCHING_INTEL'
  | 'CHATTING_WITH_USER';

export type Bounty = {
  id: string;
  objective: string;
  reward: number;
  status: 'active' | 'completed';
  ownerHandle?: string;
  createdAt?: number; // Add this for consistency
  updatedAt?: number; // Add this for consistency
};

export type DailySummary = {
    agentId: string;
    date: string; // YYYY-MM-DD format
    summary: string;
    createdAt?: number; // Add this for consistency
    updatedAt?: number; // Add this for consistency
};

// Wallet types
export type TransactionType = 'send' | 'receive' | 'claim' | 'stipend' | 'escrow' | 'room_purchase';

export type Transaction = {
  id: string;
  timestamp: number;
  type: TransactionType;
  amount: number;
  description: string;
  createdAt?: number; // Add this for consistency
  updatedAt?: number; // Add this for consistency
};

// Prediction Market types
export type MarketIntel = {
  id: string;
  eventId?: string;
  title: string;
  platform: 'Polymarket' | 'Kalshi';
  marketUrl: string;
  eventSlug?: string;
  marketSlug?: string;
  outcomes: { name: string; price: number }[];
  odds: { yes: number; no: number }; // Derived for convenience
  volume: number;
  liquidity: number;
  endsAt: number;
  imageUrl?: string;
  description?: string;
  category?: string;
  active?: boolean;
  closed?: boolean;
  tags?: string[];
};

export type Bet = {
  id: string;
  agentId: string;
  marketId: string;
  outcome: 'yes' | 'no';
  amount: number;
  price: number; // The odds at which the bet was placed (0-1)
  timestamp: number;
  status: 'pending' | 'resolved'; // Changed from active/won/lost to pending/resolved
  pnl?: number; // Profit or Loss
  sourceIntelId?: string; // ID of the BettingIntel that influenced this bet
  ownerHandle?: string; // Add this for consistency
};

export type BettingIntel = {
    id: string;
    ownerAgentId: string; // The agent who created/owns this intel
    market: string; // The market question
    content: string; // The actual intel
    sourceDescription: string;
    isTradable: boolean;
    createdAt: number;
    pnlGenerated: { // Track the profit generated by this intel
        amount: number;
        currency: string;
    };
    sourceAgentId?: string;
    pricePaid?: number;
    bountyId?: string;
    ownerHandle?: string;
    sourceUrls?: string[];
    rawResearchData?: { url: string; markdown: string; }[];
    updatedAt?: number; // Add this for consistency
}

export type MarketWatchlist = {
    id: string;
    name: string;
    markets: string[]; // List of market IDs or questions
    wallets?: string[]; // List of wallet addresses
    createdAt: number;
    updatedAt?: number; // Add this for consistency
}

// Notification type for logging
export type Notification = {
    id: string;
    userId: string;
    agentId?: string;
    type: 'agentResearch' | 'agentTrade' | 'newMarkets' | 'agentEngagement';
    message: string;
    timestamp: number;
    wasSent: boolean;
    createdAt?: number; // Add this for consistency
    updatedAt?: number; // Add this for consistency
};


// FIX: Added missing type definitions for 'Intel', 'MarketData', 'SecurityAnalysis', and 'SocialSentiment' to resolve import errors in `lib/services/alpha.service.ts`.
export type MarketData = {
  mintAddress: string;
  name: string;
  priceUsd: number;
  marketCap: number;
  liquidityUsd: number;
  priceChange24h: number;
};

export type SecurityAnalysis = {
  isHoneypot: boolean;
  isContractRenounced: boolean;
  holderConcentration: { top10Percent: number };
};

export type SocialSentiment = {
  overallSentiment: 'Bullish' | 'Bearish' | 'Neutral';
  tweets: { author: string; text: string; sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH' }[];
};

export type Intel = {
  id: string;
  token: string;
  marketData: MarketData;
  securityAnalysis: SecurityAnalysis;
  socialSentiment: SocialSentiment;
};