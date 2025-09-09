/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file contains shared type definitions used by both the client and server.
// It should not contain any runtime code or imports from client/server-specific libraries.

export type Agent = {
  id: string;
  name: string;
  personality: string;
  instructions: string;
  voice: string; // Stored as a string, validated against VoiceID on the client
  topics: string[];
  wishlist: string[];
  reputation: number;
  copiedFromId?: string;
  ownerHandle?: string;
  isShilling?: boolean;
  shillInstructions?: string;
  modelUrl?: string;
  templateId?: string; // Used when creating a new agent from a preset template
};

export interface User {
  _id?: any; // MongoDB uses ObjectId
  handle: string;
  name: string;
  info: string;
  hasCompletedOnboarding: boolean;
  lastSeen: number | null;
  solanaWalletAddress: string | null;
  userApiKey: string | null;
  createdAt: number;
  updatedAt: number;
}

export type Room = {
  id: string;
  agentIds: string[];
  hostId: string | null;
  topics: string[];
  warnFlags: number;
  rules: string[];
  activeOffer: {
    fromAgentId: string;
    toAgentId: string;
    token: string;
    price: number;
  } | null;
  vibe: string;
};

export type Interaction = {
  agentId: string;
  agentName: string;
  text: string;
  timestamp: number;
  roomId?: any; // Can be string on client, ObjectId on server
};

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
  id: string;
  token: string;
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
  ownerHandle?: string;
};

export type TransactionType = 'claim' | 'send' | 'receive' | 'stipend';

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  timestamp: number;
  ownerHandle?: string;
};
