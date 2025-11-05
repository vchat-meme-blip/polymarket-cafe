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

// Collection references with proper type
export let usersCollection: mongoose.mongo.Collection<UserDocument>;
export let agentsCollection: mongoose.mongo.Collection<AgentDocument>;
export let roomsCollection: mongoose.mongo.Collection<RoomDocument>;
export let betsCollection: mongoose.mongo.Collection<BetDocument>;
export let bountiesCollection: mongoose.mongo.Collection<BountyDocument>;
export let tradeRecordsCollection: mongoose.mongo.Collection<TradeRecordDocument>;
export let transactionsCollection: mongoose.mongo.Collection<TransactionDocument>;
export let bettingIntelCollection: mongoose.mongo.Collection<BettingIntelDocument>;
export let dailySummariesCollection: mongoose.mongo.Collection<DailySummaryDocument>;
export let notificationsCollection: mongoose.mongo.Collection<NotificationDocument>;
export let agentInteractionsCollection: mongoose.mongo.Collection<mongoose.mongo.Document>;
export let activityLogCollection: mongoose.mongo.Collection<mongoose.mongo.Document>;
export let tradeHistoryCollection: mongoose.mongo.Collection<TradeRecordDocument>;
export let marketWatchlistsCollection: mongoose.mongo.Collection<any>;

// Helper function to convert MongoDB document to plain object
function toPlainObject<T>(doc: any): T {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(toPlainObject) as unknown as T;
  if (doc.toObject) return doc.toObject({ getters: true, virtuals: false });
  return doc;
}

// Initialize database connection and collections
export async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    // If already connected, ensure collections are initialized
    if (!usersCollection) initializeCollections();
    return;
  }

  try {
    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    initializeCollections();
    
    console.log('MongoDB connected and collections initialized');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

function initializeCollections() {
  if (!mongoose.connection.db) {
    console.error('MongoDB connection not established');
    return;
  }

  try {
    // Initialize collections after connection is established with proper MongoDB Collection type
    const db = mongoose.connection.db as unknown as mongoose.mongo.Db;
    
    usersCollection = db.collection<UserDocument>('users');
    agentsCollection = db.collection<AgentDocument>('agents');
    roomsCollection = db.collection<RoomDocument>('rooms');
    betsCollection = db.collection<BetDocument>('bets');
    bountiesCollection = db.collection<BountyDocument>('bounties');
    tradeRecordsCollection = db.collection<TradeRecordDocument>('traderecords');
    transactionsCollection = db.collection<TransactionDocument>('transactions');
    bettingIntelCollection = db.collection<BettingIntelDocument>('bettingintel');
    dailySummariesCollection = db.collection<DailySummaryDocument>('dailysummaries');
    notificationsCollection = db.collection<NotificationDocument>('notifications');
    agentInteractionsCollection = db.collection<mongoose.mongo.Document>('agentinteractions');
    activityLogCollection = db.collection<mongoose.mongo.Document>('activity_logs');
    tradeHistoryCollection = db.collection<TradeRecordDocument>('trade_history');
  marketWatchlistsCollection = db.collection('market_watchlists');

    // Create indexes
    Promise.all([
      usersCollection.createIndex({ email: 1 }, { unique: true }),
      agentsCollection.createIndex({ name: 1 }, { unique: true }),
      roomsCollection.createIndex({ name: 1 }, { unique: true }),
    ]).catch(err => console.error('Error creating indexes:', err));
  } catch (error) {
    console.error('Error initializing collections:', error);
  }
}

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
  try {
    await connectDB(); // Ensure DB is connected
    console.log('Starting database seeding...');
    await seedMcpAgents();
    await seedPublicRooms();
    console.log('Database seeding completed successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}