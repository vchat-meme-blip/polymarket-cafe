// Load environment variables first
import loadEnv from '../load-env.js';
loadEnv();

import connectDB from '../db.js';
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
    console.log('Re-seeding initial data...');
    
    // Re-run the seed function to create initial data
    const { seedDatabase } = await import('../db.js');
    await seedDatabase();
    
    console.log('Database reset and re-seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  }
}

// Run the reset
resetDatabase();
