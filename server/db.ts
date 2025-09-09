import { MongoClient, Db, Collection } from 'mongodb';
import { Agent, User, Room, Interaction, Bounty, Intel, Transaction } from '../lib/types/index.js';
import { config } from './config.js';

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
        for (let attempt = 1; attempt <= config.mongodb.retryAttempts; attempt++) {
            try {
                client = new MongoClient(config.mongodb.uri);
                await client.connect();
                db = client.db(config.mongodb.dbName);
                
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
                if (attempt === config.mongodb.retryAttempts) {
                    throw new Error('Failed to connect to MongoDB after multiple attempts');
                }
                await sleep(config.mongodb.retryDelay);
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
