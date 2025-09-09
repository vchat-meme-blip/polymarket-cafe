import process from 'process';

// Environment variables are loaded by `server/config-loader.js` before execution.
// The main validation check is now in `server/index.ts` for better startup error visibility.

export const config = {
    mongodb: {
        // The `!` asserts that the URI will be present. If it's not, the startup check in index.ts will have already exited the process.
        uri: process.env.MONGODB_URI!,
        dbName: process.env.MONGODB_DB_NAME || 'quants_cafe',
        retryAttempts: 5,
        retryDelay: 2000,
    }
};