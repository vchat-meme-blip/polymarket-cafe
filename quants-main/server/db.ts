import { MongoClient, Db, Collection } from 'mongodb';
import { Agent, User, Room, Interaction, Bounty, Intel, Transaction } from '../lib/types/index.js';

export type ActivityLog = {
    agentId: string;
    timestamp: number;
    type: 'move' | 'conversation' | 'offer' | 'trade' | 'intel_discovery' | 'bounty_hit';
    description: string;
    details?: Record<string, any>;
};

const DB_NAME = process.env.MONGODB_DB_NAME || 'quants_cafe';
const MONGO_URI = process.env.MONGODB_URI!;
const RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 2000;


let db: Db;
let usersCollection: Collection<User>;
let agentsCollection: Collection<Agent>;
let roomsCollection: Collection<Room>;
let conversationsCollection: Collection<Interaction>;
let bountiesCollection: Collection<Bounty>;
let intelCollection: Collection<Intel>;
let transactionsCollection: Collection<Transaction>;
let activityLogCollection: Collection<ActivityLog>;
let client: MongoClient;
let isConnecting = false;
let connectionPromise: Promise<void> | null = null;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const connectDB = async () => {
    if (db) return;
    if (isConnecting) {
        await connectionPromise;
        return;
    }

    isConnecting = true;
    connectionPromise = (async () => {
        // FIX: Replaced direct usage of `config.mongodb` with `process.env` variables to align with the new centralized configuration management in `server/env.ts`. This simplifies dependency management and ensures consistent access to environment settings.
        for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
            try {
                client = new MongoClient(MONGO_URI);
                await client.connect();
                db = client.db(DB_NAME);
                
                // Initialize collections
                usersCollection = db.collection<User>('users');
                agentsCollection = db.collection<Agent>('agents');
                roomsCollection = db.collection<Room>('rooms');
                conversationsCollection = db.collection<Interaction>('conversations');
                bountiesCollection = db.collection<Bounty>('bounties');
                intelCollection = db.collection<Intel>('intel');
                transactionsCollection = db.collection<Transaction>('transactions');
                activityLogCollection = db.collection<ActivityLog>('activity_log');

                console.log('[DB] Successfully connected to MongoDB');
                return;
            } catch (error) {
                console.error(`[DB] Connection attempt ${attempt} failed:`, error);
                if (attempt === RETRY_ATTEMPTS) {
                    throw new Error('Failed to connect to MongoDB after multiple attempts');
                }
                await sleep(RETRY_DELAY);
            }
        }
    })();

    try {
        await connectionPromise;
    } finally {
        isConnecting = false;
        connectionPromise = null;
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