import { MongoClient, Db, Collection } from 'mongodb';
import { Agent } from '../lib/presets/agents.js';
import { User } from '../lib/state.js';
import { Room, Interaction } from '../lib/state/arena.js';
import { Bounty, Intel } from '../lib/state/autonomy.js';
import { Transaction } from '../lib/state/wallet.js';

export type ActivityLog = {
    agentId: string;
    timestamp: number;
    type: 'move' | 'conversation' | 'offer' | 'trade' | 'intel_discovery' | 'bounty_hit';
    description: string;
    details?: Record<string, any>;
};

const DB_NAME = process.env.MONGODB_DB_NAME || 'quants_cafe';

let db: Db;
let usersCollection: Collection<User>;
let agentsCollection: Collection<Agent>;
let roomsCollection: Collection<Room>;
let conversationsCollection: Collection<Interaction>;
let bountiesCollection: Collection<Bounty>;
let intelCollection: Collection<Intel>;
let transactionsCollection: Collection<Transaction>;
let activityLogCollection: Collection<ActivityLog>;

export const connectDB = async () => {
  if (db) {
    return;
  }
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not set. Please define it in your environment (.env.local or system env).');
    }
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db(DB_NAME);
    usersCollection = db.collection<User>('users');
    agentsCollection = db.collection<Agent>('agents');
    roomsCollection = db.collection<Room>('rooms');
    conversationsCollection = db.collection<Interaction>('conversations');
    bountiesCollection = db.collection<Bounty>('bounties');
    intelCollection = db.collection<Intel>('intel');
    transactionsCollection = db.collection<Transaction>('transactions');
    activityLogCollection = db.collection<ActivityLog>('activity_log');

    console.log('Successfully connected to MongoDB.');
  } catch (error) {
    console.error('Could not connect to MongoDB', error);
    throw new Error('Could not connect to MongoDB. Exiting.');
  }
};

export { 
    usersCollection, 
    agentsCollection,
    roomsCollection,
    conversationsCollection,
    bountiesCollection,
    intelCollection,
    transactionsCollection,
    activityLogCollection
};
