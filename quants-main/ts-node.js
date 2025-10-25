// Enable source map support for better stack traces
import 'source-map-support/register.js';

// Enable better error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  if (reason instanceof Error) {
    console.error('Error stack:', reason.stack);
  }
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  console.error('Error stack:', error.stack);
  process.exit(1);
});

// Load environment variables
import { config } from 'dotenv';
config({ path: '.env.local' });

// Enable debug logging
console.log('[ts-node] Starting with NODE_ENV:', process.env.NODE_ENV);

// Register TypeScript ESM loader with debugging
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

console.log('[ts-node] Registering TypeScript ESM loader...');
try {
  register('ts-node/esm', pathToFileURL(import.meta.url));
  console.log('[ts-node] TypeScript ESM loader registered successfully');
} catch (error) {
  console.error('[ts-node] Failed to register TypeScript ESM loader:', error);
  if (error instanceof Error) {
    console.error('Error stack:', error.stack);
  }
  process.exit(1);
}
