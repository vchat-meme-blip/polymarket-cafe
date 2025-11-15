/// <reference types="node" />

import mongoose, { Collection, Document } from 'mongoose';
import type {
  // Base types
  Agent,
  Room,
  User,
  Bet,
  TradeRecord,
  Transaction,
  BettingIntel,
  DailySummary,
  Notification,
  CreditUsageLog,
  // MongoDB document types
  AgentDocument,
  RoomDocument,
  UserDocument,
  BetDocument,
  TradeRecordDocument,
  TransactionDocument,
  BettingIntelDocument,
  DailySummaryDocument,
  NotificationDocument,
  CreditUsageLogDocument,
  // Utility types
  WithMongoId,
  // Conversion functions
  toSharedUser,
  toSharedAgent
} from '../lib/types/mongodb.js';
import { PRESET_AGENTS } from '../lib/presets/agents.js';
import { ActivityLogEntry, Interaction } from '../lib/types/index.js';

// Load environment variables first
import loadEnv from './load-env.js';
loadEnv();

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set.');
}

// Use the URI as-is without appending additional parameters
// The connection options will be set in the mongoose.connect() call
const connectionString = uri;

// Collection references with proper typing
export let usersCollection: Collection<UserDocument>;
export let agentsCollection: Collection<AgentDocument>;
export let roomsCollection: Collection<RoomDocument>;
export let betsCollection: Collection<BetDocument>;
export let activityLogCollection: Collection<ActivityLogEntry>;
export let tradeHistoryCollection: Collection<TradeRecordDocument>;
export let transactionsCollection: Collection<TransactionDocument>;
export let bettingIntelCollection: Collection<BettingIntelDocument>;
export let marketWatchlistsCollection: Collection<Document>;
export let dailySummariesCollection: Collection<DailySummaryDocument>;
export let notificationsCollection: Collection<NotificationDocument>;
export let agentInteractionsCollection: Collection<Interaction>;
export let newMarketsCacheCollection: Collection<Document>;
export let creditUsageLogsCollection: Collection<CreditUsageLogDocument>;


// Helper function to convert MongoDB document to plain object
function toPlainObject<T>(doc: any): T {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(toPlainObject) as unknown as T;
  if (doc.toObject) return doc.toObject({ getters: true, virtuals: false });
  return doc;
}

// Initialize database connection and collections
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      tls: true,
      tlsAllowInvalidCertificates: true,
      maxPoolSize: 10,
      minPoolSize: 1,
      appName: 'polymarket-cafe',
      retryWrites: true,
      retryReads: true,
    });

    console.log('MongoDB connected successfully.');

    // Initialize collection references with proper typing
    usersCollection = mongoose.connection.collection<UserDocument>('users');
    agentsCollection = mongoose.connection.collection<AgentDocument>('agents');
    roomsCollection = mongoose.connection.collection<RoomDocument>('rooms');
    betsCollection = mongoose.connection.collection<BetDocument>('bets');
    activityLogCollection = mongoose.connection.collection<ActivityLogEntry>('activity_logs');
    tradeHistoryCollection = mongoose.connection.collection<TradeRecordDocument>('trade_history');
    transactionsCollection = mongoose.connection.collection<TransactionDocument>('transactions');
    bettingIntelCollection = mongoose.connection.collection<BettingIntelDocument>('bettingIntel');
    marketWatchlistsCollection = mongoose.connection.collection<Document>('marketWatchlists');
    dailySummariesCollection = mongoose.connection.collection<DailySummaryDocument>('dailySummaries');
    notificationsCollection = mongoose.connection.collection<NotificationDocument>('notifications');
    agentInteractionsCollection = mongoose.connection.collection<Interaction>('agent_interactions');
    newMarketsCacheCollection = mongoose.connection.collection<Document>('new_markets_cache');
    creditUsageLogsCollection = mongoose.connection.collection<CreditUsageLogDocument>('credit_usage_logs');

    // Add 'credits' field to users collection if it doesn't exist
    await usersCollection.updateMany({ credits: { $exists: false } }, { $set: { credits: 1000 } });


    // Create indexes
    await Promise.all([
      usersCollection.createIndex({ handle: 1 }, { unique: true }),
      agentsCollection.createIndex({ id: 1 }, { unique: true }),
      agentsCollection.createIndex({ ownerHandle: 1 }),
      roomsCollection.createIndex({ id: 1 }, { unique: true }),
      agentInteractionsCollection.createIndex({ roomId: 1, timestamp: -1 }),
      newMarketsCacheCollection.createIndex({ detectedAt: -1 }),
      creditUsageLogsCollection.createIndex({ ownerHandle: 1, timestamp: -1 }),
    ]);

    // Clear rooms on startup in development for a clean slate
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DB Seeder] Development environment detected. Clearing storefronts...');
      try {
        const roomDeletion = await roomsCollection.deleteMany({ isOwned: true });
        console.log(`[DB Seeder] Deleted ${roomDeletion.deletedCount} storefronts.`);
        const userUpdate = await usersCollection.updateMany(
          { ownedRoomId: { $exists: true } },
          { $unset: { ownedRoomId: "" } }
        );
        console.log(`[DB Seeder] Reset ownedRoomId for ${userUpdate.modifiedCount} users.`);
      } catch (err) {
        console.error('[DB Seeder] Error clearing storefronts:', err);
      }
    }

    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

// Close the Mongoose connection when the Node process ends
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('Mongoose default connection disconnected through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
    process.exit(1);
  }
});

export { mongoose as db };
export default connectDB;

export async function seedMcpAgents() {
  const agentCount = await agentsCollection.countDocuments({ ownerHandle: { $exists: false } });
  if (agentCount > 0) {
    console.log('[DB Seeder] MCP agents already exist. Skipping seed.');
    return;
  }
  
  console.log('[DB Seeder] Seeding MCP agents...');
  const mcpDocuments = PRESET_AGENTS.map(agentTemplate => {
    const newId = new mongoose.Types.ObjectId();
    return {
      ...agentTemplate,
      _id: newId,
      id: newId.toHexString(), // This becomes the new unique ID
      templateId: agentTemplate.id, // The original string ID is now the templateId
      ownerHandle: null, // Explicitly set ownerHandle to null for MCPs
    };
  });
  
  if (mcpDocuments.length > 0) {
    await agentsCollection.insertMany(mcpDocuments as any[]);
    console.log(`[DB Seeder] Inserted ${mcpDocuments.length} MCP agents.`);
  }
}

export async function seedDatabase() {
    await seedMcpAgents();
}