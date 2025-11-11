const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'server');

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (filePath.endsWith('.js')) {
      // Fix .js imports to include .js extension
      content = content.replace(/from\s+['"](\..*?)(?<!\.js)['"]/g, 'from "$1.js"');
      
      // Add ESM compatibility code at the top of the file
      if (!content.includes('const __filename = fileURLToPath(import.meta.url)')) {
        const esmHeader = `
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`;
        content = esmHeader + content;
      }
      
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated: ${path.relative(process.cwd(), filePath)}`);
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
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      processFile(fullPath);
    }
  });
}

console.log('Fixing import paths and ESM compatibility...');
processDirectory(distPath);
console.log('Import paths and ESM compatibility fixed!');
