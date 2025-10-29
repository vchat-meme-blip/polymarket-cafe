// Load environment variables first
import { config } from 'dotenv';
import path from 'path';

// Load .env file from project root
const envPath = path.resolve(process.cwd(), '.env.local');
config({ path: envPath });
console.log(`Loading environment from: ${envPath}`);

import connectDB, { seedDatabase, db } from '../db.js';
import mongoose, { Connection } from 'mongoose';

async function resetDatabase() {
  try {
    console.log('Connecting to database...');
    const connection = await connectDB();
    if (!connection || !connection.db) {
      throw new Error('Failed to connect to the database');
    }
    const db = connection.db;
    
    // Get all collection names
    const collections = await db.listCollections().toArray();
    const collectionNames = collections
      .map((c: { name: string }) => c.name)
      .filter((name: string) => name !== 'system.views');
    
    console.log('Dropping collections:', collectionNames);
    
    // Drop each collection
    for (const collectionName of collectionNames) {
      try {
        await db.collection(collectionName).drop();
        console.log(`Dropped collection: ${collectionName}`);
      } catch (err) {
        console.error(`Error dropping collection ${collectionName}:`, (err as Error).message);
      }
    }
    
    console.log('Database reset complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  }
}

// Run the reset
resetDatabase();
