import { ObjectId } from 'mongodb';
import type {
  User as SharedUser,
  Agent as SharedAgent,
  Room as SharedRoom,
  Bounty as SharedBounty,
  Bet as SharedBet,
  BettingIntel as SharedBettingIntel,
  MarketWatchlist as SharedMarketWatchlist,
  DailySummary as SharedDailySummary,
  Notification as SharedNotification,
  Transaction as SharedTransaction,
  TradeRecord as SharedTradeRecord
} from './shared.js';

export type { ObjectId };

// Helper type to convert string IDs to ObjectId in a type
type WithObjectId<T> = Omit<T, '_id'> & { _id: ObjectId };

/**
 * Utility type to add MongoDB's _id field to a type
 */
export type WithMongoId<T> = T & {
  _id: ObjectId;
};

/**
 * Utility type to make _id optional (for creating new documents)
 */
export type OptionalId<T> = Omit<T, '_id'> & {
  _id?: ObjectId | string;
};

// Define MongoDB document interfaces
export interface UserDocument extends Omit<SharedUser, '_id' | 'currentAgentId' | 'ownedRoomId'> {
  _id: ObjectId;
  currentAgentId?: ObjectId;
  ownedRoomId?: ObjectId;
  // Convert MongoDB document to shared type
  toShared(): SharedUser;
}

export interface AgentDocument extends Omit<SharedAgent, 
  '_id' | 'bettingHistory' | 'currentRoomId' | 'bets' | 'lastActiveAt' | 'createdAt' | 'updatedAt'
> {
  _id: ObjectId;
  bettingHistory: ObjectId[];
  currentRoomId?: ObjectId;
  bets: ObjectId[];
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
  // Convert MongoDB document to shared type
  toShared(): SharedAgent;
}

export interface RoomDocument extends Omit<SharedRoom, 'id' | 'agentIds' | 'hostId' | 'bannedAgentIds'> {
  _id: ObjectId;
  agentIds: ObjectId[];
  hostId: ObjectId | null;
  bannedAgentIds: ObjectId[];
  // Convert MongoDB document to shared type
  toShared(): SharedRoom;
}

export interface BountyDocument extends WithObjectId<Omit<SharedBounty, 'id'>> {
  // Convert MongoDB document to shared type
  toShared(): SharedBounty;
}

export interface BetDocument extends Omit<SharedBet, 'id' | 'agentId' | 'sourceIntelId' | 'timestamp'> {
  _id: ObjectId;
  agentId: ObjectId;
  sourceIntelId?: ObjectId;
  timestamp: Date;
  // Convert MongoDB document to shared type
  toShared(): SharedBet;
}

export interface BettingIntelDocument extends Omit<SharedBettingIntel, 
  'id' | 'ownerAgentId' | 'sourceAgentId' | 'bountyId' | 'createdAt'
> {
  _id: ObjectId;
  ownerAgentId: ObjectId;
  sourceAgentId?: ObjectId;
  bountyId?: ObjectId;
  createdAt: Date;
  // Convert MongoDB document to shared type
  toShared(): SharedBettingIntel;
}

export interface MarketWatchlistDocument extends WithObjectId<Omit<SharedMarketWatchlist, 'id'>> {
  // Convert MongoDB document to shared type
  toShared(): SharedMarketWatchlist;
}

export interface DailySummaryDocument extends Omit<SharedDailySummary, 'agentId' | 'date' | 'id'> {
  _id: ObjectId;
  agentId: ObjectId;
  date: Date;
  // Convert MongoDB document to shared type
  toShared(): SharedDailySummary;
}

export interface NotificationDocument extends Omit<SharedNotification, 'id' | 'userId' | 'agentId' | 'timestamp'> {
  _id: ObjectId;
  userId: ObjectId;
  agentId?: ObjectId;
  timestamp: Date;
  // Convert MongoDB document to shared type
  toShared(): SharedNotification;
}

export interface TransactionDocument extends Omit<SharedTransaction, 'id' | 'timestamp'> {
  _id: ObjectId;
  timestamp: Date;
  // Convert MongoDB document to shared type
  toShared(): SharedTransaction;
}

export interface TradeRecordDocument extends Omit<SharedTradeRecord, 'fromId' | 'toId' | 'roomId' | 'timestamp'> {
  _id: ObjectId;
  fromId: ObjectId;
  toId: ObjectId;
  roomId: ObjectId;
  timestamp: Date;
  // Convert MongoDB document to shared type
  toShared(): SharedTradeRecord;
}

// Helper functions to convert between MongoDB and shared types
export function toSharedUser(doc: UserDocument): SharedUser {
  return {
    ...doc,
    _id: doc._id.toString(),
    currentAgentId: doc.currentAgentId?.toString(),
    ownedRoomId: doc.ownedRoomId?.toString()
  };
}

export function toSharedAgent(doc: AgentDocument): SharedAgent {
  // Create a new object with only the properties that exist in SharedAgent
  const agent: any = { ...doc };
  
  // Convert ObjectId to string for the _id field
  agent.id = doc._id.toString();
  
  // Convert other ObjectId fields
  if (doc.currentRoomId) {
    agent.currentRoomId = doc.currentRoomId.toString();
  }
  
  // Convert dates to timestamps
  agent.lastActiveAt = doc.lastActiveAt.getTime();
  agent.createdAt = doc.createdAt.getTime();
  agent.updatedAt = doc.updatedAt.getTime();
  
  // Initialize arrays that will be populated by the database layer
  agent.bettingHistory = [];
  agent.bets = [];
  
  // Remove MongoDB-specific properties
  delete agent._id;
  delete agent.__v;
  
  return agent as unknown as SharedAgent;
}

// Add similar conversion functions for other document types
// ...

// Re-export shared types for convenience
export type {
  SharedUser as User,
  SharedAgent as Agent,
  SharedRoom as Room,
  SharedBounty as Bounty,
  SharedBet as Bet,
  SharedBettingIntel as BettingIntel,
  SharedMarketWatchlist as MarketWatchlist,
  SharedDailySummary as DailySummary,
  SharedNotification as Notification,
  SharedTransaction as Transaction,
  SharedTradeRecord as TradeRecord
};