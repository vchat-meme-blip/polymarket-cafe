const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'dist', 'server', 'server.js');
const indexPath = path.join(process.cwd(), 'dist', 'server', 'index.js');

// If index.js doesn't exist but server.js does, copy it
if (!fs.existsSync(indexPath) && fs.existsSync(serverPath)) {
  fs.copyFileSync(serverPath, indexPath);
  console.log('Created index.js from server.js');
} else if (!fs.existsSync(indexPath)) {
  console.error('No entry point found! Looking for:', indexPath);
  console.log('Available files in dist/server:', 
    fs.readdirSync(path.join(process.cwd(), 'dist', 'server'))
  );
  process.exit(1);
}

console.log('Entry point verified:', indexPath);
