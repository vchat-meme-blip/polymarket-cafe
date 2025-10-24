import { MongoClient, Db, Collection, Document } from 'mongodb';
import { Agent, Room, User, Bet, Bounty, TradeRecord, Transaction, BettingIntel, DailySummary, Notification } from '../lib/types/index.js';

let uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set.');
}

// Clean up the URI and ensure it has the correct parameters
uri = uri.split('?')[0]; // Remove any existing query parameters
uri += '?retryWrites=true&w=majority&tls=true';

// MongoDB connection options
export const client = new MongoClient(uri, {
  // Connection options
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  
  // TLS/SSL configuration
  tls: true,
  tlsAllowInvalidCertificates: true, // Temporarily allow invalid certificates for testing
  tlsInsecure: true, // Temporarily disable certificate validation for testing
  
  // Connection settings
  directConnection: false,
  maxPoolSize: 10,
  minPoolSize: 1,
  
  // Application identification
  appName: 'polymarket-cafe',
  
  // Retry logic
  retryWrites: true,
  retryReads: true,
  
  // Node.js TLS options (merged with the connection options)
  // Note: These are Node.js TLS options, not MongoDB-specific
  // @ts-ignore - The type definitions don't include these but they are valid
  secureProtocol: 'TLSv1_2_method',
  // @ts-ignore
  rejectUnauthorized: false
});
let db: Db;

// Define exported variables for collections
export let usersCollection: Collection<User>;
export let agentsCollection: Collection<Agent>;
export let roomsCollection: Collection<Room>;
export let betsCollection: Collection<Bet>;
export let bountiesCollection: Collection<Bounty>;
export let activityLogCollection: Collection<any>;
export let tradeHistoryCollection: Collection<TradeRecord>;
export let transactionsCollection: Collection<Transaction>;
export let bettingIntelCollection: Collection<BettingIntel>;
export let marketWatchlistsCollection: Collection<any>;
export let dailySummariesCollection: Collection<DailySummary>;
export let notificationsCollection: Collection<Notification>;


export async function connectDB() {
  if (db) {
    return;
  }
  await client.connect();
  db = client.db();
  console.log('[DB] Successfully connected to MongoDB.');

  // Initialize collections after the connection is established
  usersCollection = db.collection<User>('users');
  agentsCollection = db.collection<Agent>('agents');
  roomsCollection = db.collection<Room>('rooms');
  betsCollection = db.collection<Bet>('bets');
  bountiesCollection = db.collection<Bounty>('bounties');
  activityLogCollection = db.collection<any>('activity_logs');
  tradeHistoryCollection = db.collection<TradeRecord>('trade_history');
  transactionsCollection = db.collection<Transaction>('transactions');
  bettingIntelCollection = db.collection<BettingIntel>('bettingIntel');
  marketWatchlistsCollection = db.collection('marketWatchlists');
  dailySummariesCollection = db.collection<DailySummary>('dailySummaries');
  notificationsCollection = db.collection<Notification>('notifications');

  // Ensure indexes for performance
  await usersCollection.createIndex({ handle: 1 }, { unique: true });
  await agentsCollection.createIndex({ id: 1 }, { unique: true });
  await agentsCollection.createIndex({ ownerHandle: 1 });
  await roomsCollection.createIndex({ id: 1 }, { unique: true });
}

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