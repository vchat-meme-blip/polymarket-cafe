/// <reference types="node" />

import mongoose, { Collection, Document } from 'mongoose';
import type {
  // Base types
  Agent,
  Room,
  User,
  Bet,
  Bounty,
  TradeRecord,
  Transaction,
  BettingIntel,
  DailySummary,
  Notification,
  // MongoDB document types
  AgentDocument,
  RoomDocument,
  UserDocument,
  BetDocument,
  BountyDocument,
  TradeRecordDocument,
  TransactionDocument,
  BettingIntelDocument,
  DailySummaryDocument,
  NotificationDocument,
  // Utility types
  WithMongoId,
  // Conversion functions
  toSharedUser,
  toSharedAgent
} from '../lib/types/mongodb.js';
import { PRESET_AGENTS } from '../lib/presets/agents.js';

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
export let bountiesCollection: Collection<BountyDocument>;
export let activityLogCollection: Collection<Document>;
export let tradeHistoryCollection: Collection<TradeRecordDocument>;
export let transactionsCollection: Collection<TransactionDocument>;
export let bettingIntelCollection: Collection<BettingIntelDocument>;
export let marketWatchlistsCollection: Collection<Document>;
export let dailySummariesCollection: Collection<DailySummaryDocument>;
export let notificationsCollection: Collection<NotificationDocument>;
export let agentInteractionsCollection: Collection<Document>;


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
    bountiesCollection = mongoose.connection.collection<BountyDocument>('bounties');
    activityLogCollection = mongoose.connection.collection<Document>('activity_logs');
    tradeHistoryCollection = mongoose.connection.collection<TradeRecordDocument>('trade_history');
    transactionsCollection = mongoose.connection.collection<TransactionDocument>('transactions');
    bettingIntelCollection = mongoose.connection.collection<BettingIntelDocument>('bettingIntel');
    marketWatchlistsCollection = mongoose.connection.collection<Document>('marketWatchlists');
    dailySummariesCollection = mongoose.connection.collection<DailySummaryDocument>('dailySummaries');
    notificationsCollection = mongoose.connection.collection<NotificationDocument>('notifications');
    agentInteractionsCollection = mongoose.connection.collection<Document>('agent_interactions');


    // Create indexes
    await Promise.all([
      usersCollection.createIndex({ handle: 1 }, { unique: true }),
      agentsCollection.createIndex({ id: 1 }, { unique: true }),
      agentsCollection.createIndex({ ownerHandle: 1 }),
      roomsCollection.createIndex({ id: 1 }, { unique: true })
    ]);

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
  const mcpDocuments = PRESET_AGENTS.map(agentTemplate => ({
    ...agentTemplate, // This preserves the original string ID like 'tony-pump'
    _id: new mongoose.Types.ObjectId(), // Let MongoDB generate its own internal ID
    boxBalance: 500, // Genesis credit drop
  }));
  
  if (mcpDocuments.length > 0) {
    await agentsCollection.insertMany(mcpDocuments as any[]);
    console.log(`[DB Seeder] Inserted ${mcpDocuments.length} MCP agents.`);
  }
}

export async function seedPublicRooms() {
  if (!roomsCollection) {
    console.warn('[DB Seeder] roomsCollection is not initialized, skipping public room seed.');
    return;
  }
  const roomCount = await roomsCollection.countDocuments({ isOwned: { $ne: true } });
  if (roomCount > 0) {
    console.log('[DB Seeder] Public rooms already exist. Skipping seed.');
    return;
  }
  
  console.log('[DB Seeder] Seeding public rooms...');
  const publicRooms = Array.from({ length: 5 }).map((_, i) => {
    const newId = new mongoose.Types.ObjectId();
    return {
      _id: newId,
      id: `public-${i + 1}`,
      name: `Public Room ${i + 1}`,
      agentIds: [],
      hostId: null,
      topics: [],
      warnFlags: 0,
      rules: ['All intel trades are final.', 'No spamming.', 'Be respectful.'],
      activeOffer: null,
      vibe: 'General Chat ☕️',
      isOwned: false,
    };
  });
  
  if (publicRooms.length > 0) {
    await roomsCollection.insertMany(publicRooms as any[]);
    console.log(`[DB Seeder] Inserted ${publicRooms.length} public rooms.`);
  }
}

export async function seedDatabase() {
    await seedMcpAgents();
    await seedPublicRooms();
}
