/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file defines the shared data structures used across the client and server.
// These are the "source of truth" for what data looks like.

// Notification Settings
export type NotificationSettings = {
  agentResearch: boolean;
  agentTrades: boolean;
  newMarkets: boolean;
  agentEngagements: boolean;
  autonomyCafe: boolean;
  autonomyEngage: boolean;
  autonomyResearch: boolean;
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
  receivingWalletAddress?: string;
  createdAt: number;
  updatedAt: number;
  currentAgentId?: string;
  ownedRoomId?: string;
  phone?: string;
  notificationSettings: NotificationSettings;
};

export type AgentMode = 'Safe' | 'Degen' | 'Mag7';

// Agent types
export type Agent = {
  id: string;
  _id?: any; 
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
  intelPnl: number;
  bettingIntel: BettingIntel[];
  marketWatchlists: MarketWatchlist[];
  isProactive?: boolean; 
  trustedRoomIds?: string[];
  operatingHours?: string;
  mode?: AgentMode;
  boxBalance: number;
  portfolio: Record<string, number>;
  templateId?: string;
  copiedFromId?: string;
};

// Arena types
export type Room = {
  id: string;
  _id?: any;
  name?: string;
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
  roomId: string;
  type: 'intel' | 'watchlist';
  intelId?: string;
  market?: string;
  watchlistId?: string;
  watchlistName?: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected';
};

export type TradeRecord = {
  fromId: string;
  toId: string;
  type: 'intel' | 'watchlist';
  price: number;
  timestamp: number;
  roomId: string;
  market?: string;
  intelId?: string;
  watchlistId?: string;
  watchlistName?: string;
};

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
};

export type DailySummary = {
    agentId: string;
    date: string; 
    summary: string;
};

export type TransactionType = 'send' | 'receive' | 'claim' | 'stipend' | 'escrow' | 'room_purchase';

export type Transaction = {
  id: string;
  timestamp: number;
  type: TransactionType;
  amount: number;
  description: string;
};

export type MarketIntel = {
  id: string;
  eventId?: string;
  title: string;
  platform: 'Polymarket' | 'Kalshi';
  marketUrl: string;
  eventSlug?: string;
  marketSlug?: string;
  outcomes: { name: string; price: number }[];
  odds: { yes: number; no: number };
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
  price: number;
  timestamp: number;
  status: 'pending' | 'resolved';
  pnl?: number;
  sourceIntelId?: string;
};

export type BettingIntel = {
    id: string;
    ownerAgentId: string;
    market: string;
    content: string;
    sourceDescription: string;
    isTradable: boolean;
    price?: number;
    createdAt: number;
    pnlGenerated: {
        amount: number;
        currency: string;
        };
    sourceAgentId?: string;
    pricePaid?: number;
    bountyId?: string;
    ownerHandle?: string;
    sourceUrls?: string[];
    rawResearchData?: { url: string; markdown: string; }[];
}

export type MarketWatchlist = {
    id: string;
    name: string;
    markets: string[];
    wallets?: string[];
    createdAt: number;
    price?: number;
    isTradable?: boolean;
    sourceAgentId?: string;
    pricePaid?: number;
}

export type Notification = {
    id: string;
    userId: string;
    agentId?: string;
    type: 'agentResearch' | 'agentTrade' | 'newMarkets' | 'agentEngagement';
    message: string;
    timestamp: number;
    wasSent: boolean;
};

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
  summary?: string;
  bountyId?: string;
  timestamp: number;
  source: string;
};

export type AgentTask = {
  id: string;
  agentId: string;
  objective: string; // User-facing description
  type: 'one_time_research' | 'continuous_monitoring';
  parameters: {
    topic: string; // The subject of the research or monitoring
  };
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: number;
  updatedAt: number;
  updates: { timestamp: number, message: string }[];
  result?: {
    summary: string;
  };
  sources?: {
    title: string;
    url: string;
  }[];
};

export type ActivityLogEntry = {
  id: number;
  timestamp: number;
  type: 'move' | 'conversation' | 'intel' | 'system';
  message: string;
  triggeredNotification?: boolean;
};