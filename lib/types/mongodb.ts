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
export interface UserDocument extends Omit<SharedUser, '_id' | 'currentAgentId' | 'ownedRoomId' | 'createdAt' | 'updatedAt'> {
  _id: ObjectId;
  currentAgentId?: ObjectId;
  ownedRoomId?: ObjectId;
  createdAt?: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  // Convert MongoDB document to shared type
  toShared?(): SharedUser;
}

export interface AgentDocument extends Omit<SharedAgent, 
  '_id' | 'bettingHistory' | 'currentRoomId' | 'bets' | 'lastActiveAt' | 'createdAt' | 'updatedAt' | 'bettingIntel' | 'marketWatchlists' | 'boxBalance' | 'portfolio' | 'mode'
> {
  _id: ObjectId;
  bettingHistory?: ObjectId[]; // Change to ObjectId[]
  currentRoomId?: ObjectId;
  bets?: ObjectId[]; // Change to ObjectId[]
  lastActiveAt?: Date; // Changed to Date
  createdAt?: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  bettingIntel?: ObjectId[]; // Add this
  marketWatchlists?: ObjectId[]; // Add this
  boxBalance?: number; // Add this
  portfolio?: Record<string, number>; // Add this
  mode?: SharedAgent['mode']; // Ensure mode is correctly inherited or defined
  // Convert MongoDB document to shared type
  toShared?(): SharedAgent;
}

// FIX: Update RoomDocument to correctly extend SharedRoom and declare MongoDB specific fields.
export interface RoomDocument extends Omit<SharedRoom, 'agentIds' | 'hostId' | 'bannedAgentIds' | 'createdAt' | 'updatedAt'> { // Keep 'id' from SharedRoom
  _id: ObjectId; // Add MongoDB's _id
  id: string; // Ensure id is explicitly declared as string, matching shared type
  agentIds: ObjectId[]; // These are ObjectIds in Mongo
  hostId: ObjectId | null;
  bannedAgentIds?: ObjectId[];
  createdAt?: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  toShared?(): SharedRoom;
}

export interface BountyDocument extends WithObjectId<Omit<SharedBounty, 'id' | 'createdAt' | 'updatedAt'>> {
  ownerHandle: string; // Add ownerHandle to the document
  createdAt?: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  // Convert MongoDB document to shared type
  toShared?(): SharedBounty;
}

export interface BetDocument extends Omit<SharedBet, 'id' | 'agentId' | 'sourceIntelId' | 'timestamp' | 'createdAt' | 'updatedAt'> {
  _id: ObjectId;
  agentId: ObjectId;
  sourceIntelId?: ObjectId;
  timestamp: Date; // Changed to Date
  ownerHandle?: string; // Add ownerHandle to the document
  createdAt?: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  // Convert MongoDB document to shared type
  toShared?(): SharedBet;
}

export interface BettingIntelDocument extends Omit<SharedBettingIntel, 
  'id' | 'ownerAgentId' | 'sourceAgentId' | 'bountyId' | 'createdAt' | 'updatedAt'
> {
  _id: ObjectId;
  ownerAgentId: ObjectId;
  sourceAgentId?: ObjectId;
  bountyId?: ObjectId;
  createdAt: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  // Convert MongoDB document to shared type
  toShared?(): SharedBettingIntel;
}

export interface MarketWatchlistDocument extends WithObjectId<Omit<SharedMarketWatchlist, 'id' | 'ownerAgentId' | 'createdAt' | 'updatedAt'>> {
  ownerAgentId: ObjectId;
  createdAt: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  // Convert MongoDB document to shared type
  toShared?(): SharedMarketWatchlist;
}

export interface DailySummaryDocument extends Omit<SharedDailySummary, 'agentId' | 'date' | 'id' | 'createdAt' | 'updatedAt'> {
  _id: ObjectId;
  agentId: ObjectId;
  date: string; // YYYY-MM-DD format
  createdAt?: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  // Convert MongoDB document to shared type
  toShared?(): SharedDailySummary;
}

export interface NotificationDocument extends Omit<SharedNotification, 'id' | 'userId' | 'agentId' | 'timestamp' | 'createdAt' | 'updatedAt'> {
  _id: ObjectId;
  userId: string; // User handle for notifications
  agentId?: ObjectId;
  timestamp: Date; // Changed to Date
  createdAt?: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  // Convert MongoDB document to shared type
  toShared?(): SharedNotification;
}

export interface TransactionDocument extends Omit<SharedTransaction, 'id' | 'timestamp' | 'createdAt' | 'updatedAt'> {
  _id: ObjectId;
  timestamp: Date; // Changed to Date
  ownerHandle: string; // User handle for transactions
  createdAt?: Date; // Changed to Date
  updatedAt?: Date; // Changed to Date
  // Convert MongoDB document to shared type
  toShared?(): SharedTransaction;
}

// FIX: Update TradeRecordDocument to correctly use ObjectId for refs and Date for timestamps.
export interface TradeRecordDocument extends Omit<SharedTradeRecord, 'id' | 'fromId' | 'toId' | 'roomId' | 'timestamp' | 'createdAt' | 'updatedAt'> {
  _id: ObjectId;
  fromId: ObjectId;
  toId: ObjectId;
  roomId: ObjectId;
  timestamp: Date; // Changed to Date
  createdAt: Date; // Changed to Date
  updatedAt: Date; // Changed to Date
  toShared?(): SharedTradeRecord;
}

// Helper functions to convert between MongoDB and shared types
export function toSharedUser(doc: UserDocument): SharedUser {
  return {
    ...doc,
    _id: doc._id.toString(),
    currentAgentId: doc.currentAgentId?.toString(),
    ownedRoomId: doc.ownedRoomId?.toString(),
    createdAt: doc.createdAt?.getTime(), // Property 'getTime' does not exist on type 'number'.
    updatedAt: doc.updatedAt?.getTime(), // Property 'getTime' does not exist on type 'number'.
  } as SharedUser;
}

export function toSharedAgent(doc: AgentDocument): SharedAgent {
  const agent: any = { ...doc };
  
  agent.id = doc._id.toString();
  
  if (doc.currentRoomId) {
    agent.currentRoomId = doc.currentRoomId.toString();
  }
  
  agent.lastActiveAt = doc.lastActiveAt?.getTime() || 0;
  agent.createdAt = doc.createdAt?.getTime() || 0;
  agent.updatedAt = doc.updatedAt?.getTime() || 0;
  
  agent.bettingHistory = doc.bettingHistory?.map((id: ObjectId) => id.toString()) || [];
  agent.bets = doc.bets?.map((id: ObjectId) => id.toString()) || [];
  agent.bettingIntel = doc.bettingIntel?.map((id: ObjectId) => id.toString()) || []; // Add this
  agent.marketWatchlists = doc.marketWatchlists?.map((id: ObjectId) => id.toString()) || []; // Add this
  
  delete agent._id;
  delete agent.__v;
  
  return agent as SharedAgent;
}

export function toSharedRoom(doc: RoomDocument): SharedRoom {
  const room: any = { ...doc };
  room.id = doc._id.toString(); // Map _id to id for shared type
  room.agentIds = doc.agentIds?.map((id: ObjectId) => id.toString()) || [];
  room.hostId = doc.hostId?.toString() || null;
  room.bannedAgentIds = doc.bannedAgentIds?.map((id: ObjectId) => id.toString()) || [];
  room.createdAt = doc.createdAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  room.updatedAt = doc.updatedAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  delete room._id;
  delete room.__v;
  return room as SharedRoom;
}

export function toSharedBet(doc: BetDocument): SharedBet {
  const bet: any = { ...doc };
  bet.id = doc._id.toString();
  bet.agentId = doc.agentId.toString();
  bet.sourceIntelId = doc.sourceIntelId?.toString();
  bet.timestamp = doc.timestamp.getTime();
  bet.createdAt = doc.createdAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  bet.updatedAt = doc.updatedAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  delete bet._id;
  delete bet.__v;
  return bet as SharedBet;
}

export function toSharedBounty(doc: BountyDocument): SharedBounty {
  const bounty: any = { ...doc };
  bounty.id = doc._id.toString();
  bounty.createdAt = doc.createdAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  bounty.updatedAt = doc.updatedAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  delete bounty._id;
  delete bounty.__v;
  return bounty as SharedBounty;
}

export function toSharedBettingIntel(doc: BettingIntelDocument): SharedBettingIntel {
  const intel: any = { ...doc };
  intel.id = doc._id.toString();
  intel.ownerAgentId = doc.ownerAgentId.toString();
  intel.sourceAgentId = doc.sourceAgentId?.toString();
  intel.bountyId = doc.bountyId?.toString();
  intel.createdAt = doc.createdAt.getTime();
  intel.updatedAt = doc.updatedAt?.getTime(); // Add this
  delete intel._id;
  delete intel.__v;
  return intel as SharedBettingIntel;
}

export function toSharedMarketWatchlist(doc: MarketWatchlistDocument): SharedMarketWatchlist {
  const watchlist: any = { ...doc };
  watchlist.id = doc._id.toString();
  watchlist.ownerAgentId = doc.ownerAgentId.toString();
  watchlist.createdAt = doc.createdAt.getTime(); // Property 'getTime' does not exist on type 'number'.
  watchlist.updatedAt = doc.updatedAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  delete watchlist._id;
  delete watchlist.__v;
  return watchlist as SharedMarketWatchlist;
}

export function toSharedDailySummary(doc: DailySummaryDocument): SharedDailySummary {
  const summary: any = { ...doc };
  summary.id = doc._id.toString();
  summary.agentId = doc.agentId.toString();
  summary.createdAt = doc.createdAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  summary.updatedAt = doc.updatedAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  delete summary._id;
  delete summary.__v;
  return summary as SharedDailySummary;
}

export function toSharedNotification(doc: NotificationDocument): SharedNotification {
  const notification: any = { ...doc };
  notification.id = doc._id.toString();
  notification.agentId = doc.agentId?.toString();
  notification.timestamp = doc.timestamp.getTime();
  notification.createdAt = doc.createdAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  notification.updatedAt = doc.updatedAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  delete notification._id;
  delete notification.__v;
  return notification as SharedNotification;
}

export function toSharedTransaction(doc: TransactionDocument): SharedTransaction {
  const transaction: any = { ...doc };
  transaction.id = doc._id.toString();
  transaction.timestamp = doc.timestamp.getTime();
  transaction.createdAt = doc.createdAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  transaction.updatedAt = doc.updatedAt?.getTime(); // Property 'getTime' does not exist on type 'number'.
  delete transaction._id;
  delete transaction.__v;
  return transaction as SharedTransaction;
}

export function toSharedTradeRecord(doc: TradeRecordDocument): SharedTradeRecord {
  const trade: any = { ...doc };
  trade.id = doc._id.toString();
  trade.fromId = doc.fromId.toString();
  trade.toId = doc.toId.toString();
  trade.roomId = doc.roomId.toString();
  trade.timestamp = doc.timestamp.getTime();
  trade.createdAt = doc.createdAt.getTime(); // Property 'getTime' does not exist on type 'number'.
  trade.updatedAt = doc.updatedAt.getTime(); // Property 'getTime' does not exist on type 'number'.
  delete trade._id;
  delete trade.__v;
  return trade as SharedTradeRecord;
}

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