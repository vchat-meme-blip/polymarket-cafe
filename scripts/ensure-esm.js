const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'dist', 'server');

// Ensure the main index.js has proper ESM imports
const indexPath = path.join(serverPath, 'index.js');
if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');
    
    // Add ESM imports if not present
    if (!content.includes('import.meta.url')) {
        const esmImports = `
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`;
        fs.writeFileSync(indexPath, esmImports + content, 'utf8');
        console.log('Updated index.js with ESM imports');
    }
}

// Ensure startup.js has proper ESM imports
const startupPath = path.join(serverPath, 'server', 'startup.js');
if (fs.existsSync(startupPath)) {
    let content = fs.readFileSync(startupPath, 'utf8');
    
    // Add ESM imports if not present
    if (!content.includes('import.meta.url')) {
        const esmImports = `
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`;
        fs.writeFileSync(startupPath, esmImports + content, 'utf8');
        console.log('Updated startup.js with ESM imports');
    }
}

console.log('ESM compatibility check complete!');
