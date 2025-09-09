// Ensure dotenv loads environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Debug: log the value of MONGODB_URI
console.log('[server] MONGODB_URI:', process.env.MONGODB_URI);

// Before connecting to MongoDB, check if URI is present
if (!process.env.MONGODB_URI) {
    console.error('[server] Error: MONGODB_URI is not set. Please define it in your environment (.env.local or system env).');
    process.exit(1);
}

// ...existing code for server setup and MongoDB connection...