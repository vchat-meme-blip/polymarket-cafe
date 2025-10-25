// Re-export shared types
export * from './shared.js';

// Export MongoDB-specific types and document interfaces
export type {
  // Utility types
  WithMongoId,
  OptionalId,
  
  // Document interfaces
  UserDocument,
  AgentDocument,
  RoomDocument,
  BountyDocument,
  BetDocument,
  BettingIntelDocument,
  MarketWatchlistDocument,
  DailySummaryDocument,
  NotificationDocument,
  TransactionDocument,
  TradeRecordDocument,
  
  // Base types (re-exported from shared with MongoDB _id)
  User,
  Agent,
  Room,
  Bounty,
  Bet,
  BettingIntel,
  MarketWatchlist,
  DailySummary,
  Notification,
  Transaction,
  TradeRecord
} from './mongodb.js';

// Export conversion functions separately since they're values, not types
export { 
  toSharedUser, 
  toSharedAgent,
  toSharedRoom,
  toSharedBounty,
  toSharedBet,
  toSharedBettingIntel,
  toSharedMarketWatchlist,
  toSharedDailySummary,
  toSharedNotification,
  toSharedTransaction,
  toSharedTradeRecord
} from './mongodb.js';

// Export document type for MongoDB collections
export type MongoDocument<T> = T & {
  _id: string | import('mongodb').ObjectId;
  toJSON?: () => any;
  toObject?: (options?: any) => any;
};