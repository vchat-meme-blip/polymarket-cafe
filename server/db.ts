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

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set.');
}

// Clean up the URI and ensure it has the correct parameters
const connectionString = uri.includes('?') 
  ? `${uri}&retryWrites=true&w=majority`
  : `${uri}?retryWrites=true&w=majority`;

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

export async function seedDatabase() {
  const roomCount = await roomsCollection.countDocuments();
  if (roomCount > 0) {
    console.log('[DB Seeder] Rooms collection is not empty. Skipping seed.');
    return;
  }

  console.log('[DB Seeder] Rooms collection is empty. Seeding with default public rooms...');
  const NUM_PUBLIC_ROOMS = 10;
  const newRooms: Room[] = [];
  for (let i = 0; i < NUM_PUBLIC_ROOMS; i++) {
    newRooms.push({
      id: `room-public-${i}`,
      agentIds: [],
      hostId: null,
      topics: [],
      warnFlags: 0,
      rules: [],
      activeOffer: null,
      vibe: 'General Chat ☕️',
      isOwned: false,
    });
  }

  await roomsCollection.insertMany(newRooms as any[]);
  console.log(`[DB Seeder] Inserted ${NUM_PUBLIC_ROOMS} public rooms into the database.`);
}