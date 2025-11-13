/// <reference types="node" />

import '../load-env.js';
// FIX: Corrected import to use `db` which is the exported mongoose instance and fixed the relative path.
import connectDB, { seedDatabase, db, roomsCollection, usersCollection } from '../db.js';

async function resetDatabase() {
  // CRITICAL SAFETY CHECK: Prevent running in a production environment unless explicitly forced.
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_RESET !== 'true') {
    console.error('---------------------------------------------------------------');
    console.error('FATAL: ATTEMPTING TO RESET DATABASE IN PRODUCTION MODE!');
    console.error('This is a destructive operation. To proceed, you must set');
    console.error('the environment variable FORCE_RESET=true.');
    console.error('Example: FORCE_RESET=true npm run reset-db');
    console.error('---------------------------------------------------------------');
    process.exit(1);
  }

  try {
    await connectDB();
    console.log('Connecting to database...');

    if (db.connection.db) {
      console.log('Clearing storefronts and user ownership...');

      // 1. Delete all owned rooms (storefronts)
      const roomDeletion = await roomsCollection.deleteMany({ isOwned: true });
      console.log(`- Deleted ${roomDeletion.deletedCount} storefronts.`);

      // 2. Unset the ownedRoomId for all users
      const userUpdate = await usersCollection.updateMany(
        { ownedRoomId: { $exists: true } },
        { $unset: { ownedRoomId: "" } }
      );
      console.log(`- Reset ownedRoomId for ${userUpdate.modifiedCount} users.`);
      
      console.log('Database collections cleared!');
    } else {
      console.warn('No database connection found to clear collections.');
    }

    console.log('Re-seeding initial data (MCP agents)...');
    await seedDatabase();

    console.log('Database reset and re-seeded successfully!');
  } catch (error) {
    console.error('Error during database reset:', error);
    process.exit(1);
  } finally {
    await db.connection.close();
    console.log('Database connection closed.');
  }
}

resetDatabase();