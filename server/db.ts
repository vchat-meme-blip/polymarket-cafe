import { MongoClient, Db, Collection, Document } from 'mongodb';
import { Agent, Room, User, Bet, Bounty, TradeRecord, Transaction, BettingIntel, DailySummary, Notification } from '../lib/types/index.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set.');
}

// Update MongoDB connection options for SSL
export const client = new MongoClient(uri, {
  tls: true,
  tlsAllowInvalidCertificates: false,
  tlsInsecure: false,
  retryWrites: true,
  w: 'majority',
  appName: 'Cluster0',
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000
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