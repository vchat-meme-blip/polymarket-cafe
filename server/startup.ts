import { startServer } from './server.js';
import connectDB, { seedDatabase } from './db.js';
import './env.js';

async function main() {
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
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default main;
