/// <reference types="node" />

import './env.js';

import connectDB, { seedDatabase } from './db.js';
// FIX: Add .js extension to fix module resolution error.
import { startServer } from './server.js';

async function main() {
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI.trim() === '') {
    console.error('\n[FATAL STARTUP ERROR] MONGODB_URI is not defined in your environment.');
    console.error('The server cannot start without a database connection string.');
    console.error('Please ensure you have a `.env.local` or `.env` file in the project root with the following content:');
    console.error('MONGODB_URI="your_mongodb_connection_string_here"\n');
    // FIX: The global `process` object is available in Node.js environments without an explicit import.
    process.exit(1);
  }

  try {
    console.log('[Startup] MONGODB_URI found. Connecting to database...');
    await connectDB();
    console.log('[Startup] Database connection successful. Checking for initial data...');
    await seedDatabase();
    console.log('[Startup] Database seeding check complete. Starting server...');
    await startServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    // FIX: The global `process` object is available in Node.js environments without an explicit import.
    process.exit(1);
  }
}

main().catch(console.error);