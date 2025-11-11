/// <reference types="node" />

// Import required modules
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import http from 'node:http';
import { startServer } from './startup.js';

// Define __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set project root directory
const projectRoot = join(__dirname, '..');

// Log the current file and directory for debugging
console.log('Project root:', projectRoot);
console.log('Starting server from:', __filename);

let serverInstance: { stop: () => Promise<void> } | null = null;

// Create a basic health check server
function createHealthCheckServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    res.writeHead(404);
    res.end();
  });

  const port = process.env.HEALTH_CHECK_PORT ? parseInt(process.env.HEALTH_CHECK_PORT, 10) : 3001;
  server.listen(port, '0.0.0.0', () => {
    console.log(`[Health Check] Server running on http://0.0.0.0:${port}/api/health`);
  });

  return server;
}

async function main() {
  try {
    // Start health check server first
    const healthServer = createHealthCheckServer();
    
    // Then start the main server
    serverInstance = await startServer();
    console.log('[Server] Main process started successfully.');
    
    // Handle shutdown properly
    const shutdown = async () => {
      console.log('[Server] Shutting down...');
      healthServer.close();
      if (serverInstance) {
        await serverInstance.stop();
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    console.error('[Server] Fatal error during startup:', error);
    process.exit(1);
  }
}

// Start the server
main().catch(error => {
  console.error('Unhandled error in main process:', error);
  process.exit(1);
});
