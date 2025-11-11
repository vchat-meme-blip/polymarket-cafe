const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'server');

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add ESM compatibility code at the top of the file
    if (filePath.endsWith('.js')) {
      const esmHeader = `
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`;
      
      // Only add if not already present
      if (!content.includes('const __filename = fileURLToPath(import.meta.url)')) {
        content = esmHeader + content;
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${path.relative(process.cwd(), filePath)}`);
      }
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  files.forEach(file => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.js')) {
      processFile(fullPath);
    }
  });
}

console.log('Fixing ESM imports in compiled files...');
processDirectory(distPath);
console.log('ESM imports fixed successfully!');
