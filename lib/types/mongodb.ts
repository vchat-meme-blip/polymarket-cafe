
import type { ObjectId } from 'mongodb';
import type {
  User as SharedUser,
  Agent as SharedAgent,
  Room as SharedRoom,
  Bet as SharedBet,
  BettingIntel as SharedBettingIntel,
  MarketWatchlist as SharedMarketWatchlist,
  DailySummary as SharedDailySummary,
  Notification as SharedNotification,
  Transaction as SharedTransaction,
  TradeRecord as SharedTradeRecord
} from './shared.js';

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

// FIX: Removed 'id' from the Omit type to ensure the 'id' property from SharedRoom is inherited.
export interface RoomDocument extends Omit<SharedRoom, 'agentIds' | 'hostId' | 'bannedAgentIds'> {
  _id: ObjectId;
  agentIds: ObjectId[];
  hostId: ObjectId | null;
  bannedAgentIds: ObjectId[];
  // Convert MongoDB document to shared type
  toShared(): SharedRoom;
}

export interface BetDocument extends Omit<SharedBet, 'id' | 'agentId' | 'sourceIntelId' | 'timestamp'> {
  _id: ObjectId;
  agentId: ObjectId;
  sourceIntelId?: ObjectId;
  timestamp: Date;
  // Convert MongoDB document to shared type
  toShared(): SharedBet;
}

// FIX: Add `bountyId` to the document definition to align with application logic.
export interface BettingIntelDocument extends Omit<SharedBettingIntel, 
  'id' | 'ownerAgentId' | 'sourceAgentId' | 'createdAt' | 'bountyId'
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
  // FIX: Change date type to string to match how it's stored in the database.
  date: string;
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
  
  // Convert dates to timestamps, guarding against undefined values
  agent.lastActiveAt = doc.lastActiveAt ? doc.lastActiveAt.getTime() : Date.now();
  agent.createdAt = doc.createdAt ? doc.createdAt.getTime() : Date.now();
  agent.updatedAt = doc.updatedAt ? doc.updatedAt.getTime() : Date.now();
  
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
  SharedBet as Bet,
  SharedBettingIntel as BettingIntel,
  SharedMarketWatchlist as MarketWatchlist,
  SharedDailySummary as DailySummary,
  SharedNotification as Notification,
  SharedTransaction as Transaction,
  SharedTradeRecord as TradeRecord
};
