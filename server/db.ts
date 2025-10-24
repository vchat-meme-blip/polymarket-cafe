import mongoose, { Collection, Document } from 'mongoose';
import { Agent, Room, User, Bet, Bounty, TradeRecord, Transaction, BettingIntel, DailySummary, Notification } from '../lib/types/index.js';

// Extend the Document type to include our custom _id
type WithId<T> = T & { _id: mongoose.Types.ObjectId };

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set.');
}

// Clean up the URI and ensure it has the correct parameters
const connectionString = uri.includes('?') 
  ? `${uri}&retryWrites=true&w=majority`
  : `${uri}?retryWrites=true&w=majority`;

// Collection references with proper typing
export let usersCollection: Collection<WithId<User>>;
export let agentsCollection: Collection<WithId<Agent>>;
export let roomsCollection: Collection<WithId<Room>>;
export let betsCollection: Collection<WithId<Bet>>;
export let bountiesCollection: Collection<WithId<Bounty>>;
export let activityLogCollection: Collection<Document>;
export let tradeHistoryCollection: Collection<WithId<TradeRecord>>;
export let transactionsCollection: Collection<WithId<Transaction>>;
export let bettingIntelCollection: Collection<WithId<BettingIntel>>;
export let marketWatchlistsCollection: Collection<Document>;
export let dailySummariesCollection: Collection<WithId<DailySummary>>;
export let notificationsCollection: Collection<WithId<Notification>>;

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
    usersCollection = mongoose.connection.collection<WithId<User>>('users');
    agentsCollection = mongoose.connection.collection<WithId<Agent>>('agents');
    roomsCollection = mongoose.connection.collection<WithId<Room>>('rooms');
    betsCollection = mongoose.connection.collection<WithId<Bet>>('bets');
    bountiesCollection = mongoose.connection.collection<WithId<Bounty>>('bounties');
    activityLogCollection = mongoose.connection.collection<Document>('activity_logs');
    tradeHistoryCollection = mongoose.connection.collection<WithId<TradeRecord>>('trade_history');
    transactionsCollection = mongoose.connection.collection<WithId<Transaction>>('transactions');
    bettingIntelCollection = mongoose.connection.collection<WithId<BettingIntel>>('bettingIntel');
    marketWatchlistsCollection = mongoose.connection.collection<Document>('marketWatchlists');
    dailySummariesCollection = mongoose.connection.collection<WithId<DailySummary>>('dailySummaries');
    notificationsCollection = mongoose.connection.collection<WithId<Notification>>('notifications');

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