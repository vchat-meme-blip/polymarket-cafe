import mongoose from 'mongoose';
import { Agent, Room, User, Bet, Bounty, TradeRecord, Transaction, BettingIntel, DailySummary, Notification } from '../lib/types/index.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set.');
}

// Clean up the URI and ensure it has the correct parameters
const connectionString = uri.includes('?') 
  ? `${uri}&retryWrites=true&w=majority`
  : `${uri}?retryWrites=true&w=majority`;

// Collection references
export let usersCollection: mongoose.Collection;
export let agentsCollection: mongoose.Collection;
export let roomsCollection: mongoose.Collection;
export let betsCollection: mongoose.Collection;
export let bountiesCollection: mongoose.Collection;
export let activityLogCollection: mongoose.Collection;
export let tradeHistoryCollection: mongoose.Collection;
export let transactionsCollection: mongoose.Collection;
export let bettingIntelCollection: mongoose.Collection;
export let marketWatchlistsCollection: mongoose.Collection;
export let dailySummariesCollection: mongoose.Collection;
export let notificationsCollection: mongoose.Collection;

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

    // Initialize collection references
    usersCollection = mongoose.connection.collection('users');
    agentsCollection = mongoose.connection.collection('agents');
    roomsCollection = mongoose.connection.collection('rooms');
    betsCollection = mongoose.connection.collection('bets');
    bountiesCollection = mongoose.connection.collection('bounties');
    activityLogCollection = mongoose.connection.collection('activity_logs');
    tradeHistoryCollection = mongoose.connection.collection('trade_history');
    transactionsCollection = mongoose.connection.collection('transactions');
    bettingIntelCollection = mongoose.connection.collection('bettingIntel');
    marketWatchlistsCollection = mongoose.connection.collection('marketWatchlists');
    dailySummariesCollection = mongoose.connection.collection('dailySummaries');
    notificationsCollection = mongoose.connection.collection('notifications');

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