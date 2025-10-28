import { startServer } from './server.js';
import connectDB, { seedDatabase } from './db.js';
import './env.js';

// Check if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

async function main() {
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI.trim() === '') {
    console.error('\n[FATAL STARTUP ERROR] MONGODB_URI is not defined in your environment.');
    console.error('The server cannot start without a database connection string.');
    console.error('Please ensure you have a `.env.local` or `.env` file in the project root with the following content:');
    console.error('MONGODB_URI="your_mongodb_connection_string_here"\n');
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
    process.exit(1);
  }
}

// Only start the server if this file is run directly (not when imported)
if (isMainModule) {
  main().catch(console.error);
}

export { main as startServer };


export default main;
