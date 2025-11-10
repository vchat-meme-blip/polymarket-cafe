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
  Bet,
  BettingIntel,
  MarketWatchlist,
  DailySummary,
  Notification,
  Transaction,
  TradeRecord
} from './mongodb.js';

// Export conversion functions separately since they're values, not types
export { toSharedUser, toSharedAgent } from './mongodb.js';

// Export document type for MongoDB collections
export type MongoDocument<T> = T & {
  _id: string | any;
  toJSON?: () => any;
  toObject?: (options?: any) => any;
};