import http from 'http';
import process from 'process';

// Use a different port for the health check server
const HEALTH_PORT = process.env.HEALTH_PORT || 3002;
const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  res.writeHead(404);
  res.end();
});

server.listen(HEALTH_PORT, '0.0.0.0', () => {
  console.log(`[Health Check] Server running on http://0.0.0.0:${HEALTH_PORT}/api/health`);
});

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down health check server...');
  server.close();
  process.exit(0);
});
