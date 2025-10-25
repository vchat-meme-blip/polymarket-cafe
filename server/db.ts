/// <reference types="node" />

import mongoose, { Collection, Document } from 'mongoose';
import { // Removed 'type' from import
  // Base types
  Agent as SharedAgent,
  Room as SharedRoom,
  User as SharedUser,
  Bet as SharedBet,
  Bounty as SharedBounty,
  TradeRecord as SharedTradeRecord,
  Transaction as SharedTransaction,
  BettingIntel as SharedBettingIntel,
  DailySummary as SharedDailySummary,
  Notification as SharedNotification,
  MarketWatchlist as SharedMarketWatchlist,
  
  // MongoDB document types
  AgentDocument as AgentDocumentType,
  RoomDocument as RoomDocumentType,
  UserDocument as UserDocumentType,
  BetDocument as BetDocumentType,
  BountyDocument as BountyDocumentType,
  TradeRecordDocument as TradeRecordDocumentType,
  TransactionDocument as TransactionDocumentType,
  BettingIntelDocument as BettingIntelDocumentType,
  DailySummaryDocument as DailySummaryDocumentType,
  NotificationDocument as NotificationDocumentType,
  MarketWatchlistDocument as MarketWatchlistDocumentType,

  // Conversion functions
  toSharedUser,
  toSharedAgent,
  toSharedRoom,
  toSharedBet,
  toSharedBounty,
  toSharedBettingIntel,
  toSharedDailySummary,
  toSharedNotification,
  toSharedTransaction,
  toSharedTradeRecord,
  toSharedMarketWatchlist
} from '../lib/types/index.js'; // Import all from index.js for convenience
import { ObjectId } from 'mongodb';


const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set.');
}

// Use the URI as-is without appending additional parameters
// The connection options will be set in the mongoose.connect() call
const connectionString = uri;

// Mongoose Schemas
const userSchema = new mongoose.Schema<UserDocumentType>({
  name: { type: String, default: '' },
  info: { type: String, default: '' },
  handle: { type: String, required: true, unique: true },
  hasCompletedOnboarding: { type: Boolean, default: false },
  lastSeen: { type: Number, default: Date.now },
  userApiKey: { type: String, default: null },
  solanaWalletAddress: { type: String, default: null },
  // FIX: Change type to Date for createdAt and updatedAt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  currentAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  ownedRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  phone: { type: String, default: '' },
  notificationSettings: {
    agentResearch: { type: Boolean, default: true },
    agentTrades: { type: Boolean, default: true },
    newMarkets: { type: Boolean, default: false },
    agentEngagements: { type: Boolean, default: false },
  },
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

// FIX: Explicitly type 'this' in the virtual getter
userSchema.virtual('id').get(function(this: UserDocumentType) {
  return this._id.toHexString();
});
userSchema.method('toShared', function(this: UserDocumentType): SharedUser {
  return toSharedUser(this);
});

const agentSchema = new mongoose.Schema<AgentDocumentType>({
  id: { type: String, required: true, unique: true }, // Keep client-side ID for compatibility
  name: { type: String, required: true },
  personality: { type: String, required: true },
  instructions: { type: String, required: true },
  voice: { type: String, required: true },
  topics: { type: [String], default: [] },
  wishlist: { type: [String], default: [] },
  reputation: { type: Number, default: 100 },
  ownerHandle: { type: String, required: true, ref: 'User' },
  isShilling: { type: Boolean, default: false },
  shillInstructions: { type: String, default: '' },
  modelUrl: { type: String, default: '' },
  bettingHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bet' }], // Array of ObjectIds
  currentPnl: { type: Number, default: 0 },
  bettingIntel: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BettingIntel' }],
  marketWatchlists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MarketWatchlist' }],
  isProactive: { type: Boolean, default: true },
  trustedRoomIds: { type: [String], default: [] },
  operatingHours: { type: String, default: '' },
  mode: { type: String, enum: ['Safe', 'Degen', 'Mag7'], default: 'Safe' },
  templateId: { type: String },
  copiedFromId: { type: String },
  // Deprecated fields
  boxBalance: { type: Number, default: 0 },
  portfolio: { type: Map, of: Number, default: {} },
  lastActiveAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

agentSchema.virtual('bets', { // Virtual populate for bets
  ref: 'Bet',
  localField: '_id',
  foreignField: 'agentId'
});
agentSchema.method('toShared', function(this: AgentDocumentType): SharedAgent {
  return toSharedAgent(this);
});

const roomSchema = new mongoose.Schema<RoomDocumentType>({
  // FIX: 'id' is a client-side string ID, not conflicting with _id.
  id: { type: String, required: true, unique: true }, // Client-side ID
  name: { type: String },
  agentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Agent' }],
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
  topics: { type: [String], default: [] },
  warnFlags: { type: Number, default: 0 },
  rules: { type: [String], default: [] },
  activeOffer: { type: Object, default: null }, // Store as mixed type for now
  vibe: { type: String, default: 'General Chat ☕️' },
  isOwned: { type: Boolean, default: false },
  ownerHandle: { type: String, ref: 'User' },
  roomBio: { type: String, default: '' },
  twitterUrl: { type: String, default: '' },
  isRevenuePublic: { type: Boolean, default: false },
  bannedAgentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Agent' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

roomSchema.method('toShared', function(this: RoomDocumentType): SharedRoom {
  return toSharedRoom(this);
});

const bountySchema = new mongoose.Schema<BountyDocumentType>({
  objective: { type: String, required: true },
  reward: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  ownerHandle: { type: String, required: true, ref: 'User' },
  // FIX: Change type to Date for createdAt and updatedAt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

bountySchema.method('toShared', function(this: BountyDocumentType): SharedBounty {
  return toSharedBounty(this);
});

const betSchema = new mongoose.Schema<BetDocumentType>({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  marketId: { type: String, required: true },
  outcome: { type: String, enum: ['yes', 'no'], required: true },
  amount: { type: Number, required: true },
  price: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  pnl: { type: Number },
  sourceIntelId: { type: mongoose.Schema.Types.ObjectId, ref: 'BettingIntel' },
  ownerHandle: { type: String, ref: 'User' }, // Denormalize owner handle for easier queries
  // FIX: Change type to Date for createdAt and updatedAt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

betSchema.method('toShared', function(this: BetDocumentType): SharedBet {
  return toSharedBet(this);
});

const bettingIntelSchema = new mongoose.Schema<BettingIntelDocumentType>({
  ownerAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  market: { type: String, required: true },
  content: { type: String, required: true },
  sourceDescription: { type: String },
  isTradable: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  pnlGenerated: {
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
  },
  sourceAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  pricePaid: { type: Number },
  bountyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bounty' },
  ownerHandle: { type: String, ref: 'User' },
  sourceUrls: { type: [String], default: [] },
  rawResearchData: { type: [{ url: String, markdown: String }], default: [] },
  // FIX: Change type to Date for updatedAt
  updatedAt: { type: Date, default: Date.now },
});

bettingIntelSchema.method('toShared', function(this: BettingIntelDocumentType): SharedBettingIntel {
  return toSharedBettingIntel(this);
});

const marketWatchlistSchema = new mongoose.Schema<MarketWatchlistDocumentType>({
  ownerAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  name: { type: String, required: true },
  markets: { type: [String], default: [] },
  wallets: { type: [String], default: [] },
  // FIX: Change type to Date for createdAt and updatedAt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

marketWatchlistSchema.method('toShared', function(this: MarketWatchlistDocumentType): SharedMarketWatchlist {
  return toSharedMarketWatchlist(this);
});

const dailySummarySchema = new mongoose.Schema<DailySummaryDocumentType>({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD format
  summary: { type: String, required: true },
  // FIX: Change type to Date for createdAt and updatedAt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

dailySummarySchema.method('toShared', function(this: DailySummaryDocumentType): SharedDailySummary {
  return toSharedDailySummary(this);
});

const notificationSchema = new mongoose.Schema<NotificationDocumentType>({
  userId: { type: String, required: true, ref: 'User' }, // User handle
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  type: { type: String, required: true, enum: ['agentResearch', 'agentTrade', 'newMarkets', 'agentEngagement'] },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  wasSent: { type: Boolean, default: false },
  // FIX: Change type to Date for createdAt and updatedAt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

notificationSchema.method('toShared', function(this: NotificationDocumentType): SharedNotification {
  return toSharedNotification(this);
});

const transactionSchema = new mongoose.Schema<TransactionDocumentType>({
  type: { type: String, enum: ['send', 'receive', 'claim', 'stipend', 'escrow', 'room_purchase'], required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  ownerHandle: { type: String, required: true, ref: 'User' },
  // FIX: Change type to Date for createdAt and updatedAt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

transactionSchema.method('toShared', function(this: TransactionDocumentType): SharedTransaction {
  return toSharedTransaction(this);
});

const tradeRecordSchema = new mongoose.Schema<TradeRecordDocumentType>({
  // FIX: Use Schema.Types.ObjectId for references
  fromId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  toId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  type: { type: String, enum: ['intel'], required: true },
  market: { type: String, required: true },
  intelId: { type: mongoose.Schema.Types.ObjectId, ref: 'BettingIntel' },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  timestamp: { type: Date, default: Date.now },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  // FIX: Change type to Date for createdAt and updatedAt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

tradeRecordSchema.method('toShared', function(this: TradeRecordDocumentType): SharedTradeRecord {
  return toSharedTradeRecord(this);
});

// Mongoose Models
export const UserModel = mongoose.model('User', userSchema);
export const AgentModel = mongoose.model('Agent', agentSchema);
export const RoomModel = mongoose.model('Room', roomSchema);
export const BountyModel = mongoose.model('Bounty', bountySchema);
export const BetModel = mongoose.model('Bet', betSchema);
export const BettingIntelModel = mongoose.model('BettingIntel', bettingIntelSchema);
export const MarketWatchlistModel = mongoose.model('MarketWatchlist', marketWatchlistSchema);
export const DailySummaryModel = mongoose.model('DailySummary', dailySummarySchema);
export const NotificationModel = mongoose.model('Notification', notificationSchema);
export const TransactionModel = mongoose.model('Transaction', transactionSchema);
export const TradeRecordModel = mongoose.model('TradeRecord', tradeRecordSchema);


// Collection references with proper typing
// FIX: Correct collection references to use proper Mongoose Collection generic types.
export let usersCollection: Collection<UserDocumentType & mongoose.Document>;
export let agentsCollection: Collection<AgentDocumentType & mongoose.Document>;
export let roomsCollection: Collection<RoomDocumentType & mongoose.Document>;
export let betsCollection: Collection<BetDocumentType & mongoose.Document>;
export let bountiesCollection: Collection<BountyDocumentType & mongoose.Document>;
export let activityLogCollection: Collection<mongoose.Document>; // Placeholder, detailed schema if needed later
export let tradeHistoryCollection: Collection<TradeRecordDocumentType & mongoose.Document>;
export let transactionsCollection: Collection<TransactionDocumentType & mongoose.Document>;
export let bettingIntelCollection: Collection<BettingIntelDocumentType & mongoose.Document>;
export let marketWatchlistsCollection: Collection<MarketWatchlistDocumentType & mongoose.Document>;
export let dailySummariesCollection: Collection<DailySummaryDocumentType & mongoose.Document>;
export let notificationsCollection: Collection<NotificationDocumentType & mongoose.Document>;

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
    usersCollection = UserModel.collection;
    agentsCollection = AgentModel.collection;
    roomsCollection = RoomModel.collection;
    betsCollection = BetModel.collection;
    bountiesCollection = BountyModel.collection;
    activityLogCollection = mongoose.connection.collection<Document>('activity_logs');
    tradeHistoryCollection = TradeRecordModel.collection;
    transactionsCollection = TransactionModel.collection;
    bettingIntelCollection = BettingIntelModel.collection;
    marketWatchlistsCollection = MarketWatchlistModel.collection;
    dailySummariesCollection = DailySummaryModel.collection;
    notificationsCollection = NotificationModel.collection;

    // Create indexes
    await Promise.all([
      usersCollection.createIndex({ handle: 1 }, { unique: true }),
      usersCollection.createIndex({ solanaWalletAddress: 1 }),
      agentsCollection.createIndex({ id: 1 }, { unique: true }),
      agentsCollection.createIndex({ ownerHandle: 1 }),
      roomsCollection.createIndex({ id: 1 }, { unique: true }),
      roomsCollection.createIndex({ ownerHandle: 1 }),
      betsCollection.createIndex({ agentId: 1, status: 1 }),
      bettingIntelCollection.createIndex({ ownerAgentId: 1, market: 1 }),
      notificationsCollection.createIndex({ userId: 1, timestamp: -1 }),
      dailySummariesCollection.createIndex({ agentId: 1, date: 1 }, { unique: true }),
    ]);

    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // FIX: The `process` object is available globally in Node.js.
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
// FIX: The `process` object is available globally in Node.js.
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('Mongoose default connection disconnected through app termination');
    // FIX: The `process` object is available globally in Node.js.
    process.exit(0);
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
    // FIX: The `process` object is available globally in Node.js.
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
  const newRooms: SharedRoom[] = [];
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