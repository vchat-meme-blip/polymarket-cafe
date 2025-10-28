import '../server/load-env.js';
// FIX: Corrected import to use `db` which is the exported mongoose instance.
import connectDB, { seedDatabase, db } from '../server/db.js';

async function resetDatabase() {
  try {
    await connectDB();
    console.log('Connecting to database...');

    if (db.connection.db) {
      const collections = await db.connection.db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      console.log('Dropping collections:', collectionNames.filter(name => !name.startsWith('system.')));

      await Promise.all(collectionNames.map(async (collectionName) => {
        if (!collectionName.startsWith('system.')) {
          try {
            await db.connection.db.dropCollection(collectionName);
            console.log(`Dropped collection: ${collectionName}`);
          } catch (error: any) {
            if (error.codeName !== 'NamespaceNotFound') {
              throw error;
            }
          }
        }
      }));
      
      console.log('Database reset complete!');
    } else {
      console.warn('No database connection found to drop collections.');
    }

    console.log('Re-seeding initial data...');
    await seedDatabase();

    console.log('Database reset and re-seeded successfully!');
  } catch (error) {
    console.error('Error during database reset:', error);
    process.exit(1);
  } finally {
    await db.connection.close();
  }
}

resetDatabase();