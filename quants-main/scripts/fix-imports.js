#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(process.cwd(), 'dist', 'server');

async function processFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf8');
    let modified = false;

    // Replace .ts imports with .js (handling both single and double quotes)
    const tsImportRegex = /(from\s+['"])([^'"]+)\.ts(['"])/g;
    let newContent = content.replace(tsImportRegex, (match, p1, p2, p3) => {
      // Skip if already has .js extension or is a node_modules import
      if (p2.endsWith('.js') || p2.startsWith('node_modules/')) {
        return match;
      }
      modified = true;
      return `${p1}${p2}.js${p3}`;
    });

    // Handle path aliases (replace @/ with relative paths)
    if (newContent.includes('@/')) {
      const relativePath = filePath
        .replace(DIST_DIR, '')
        .split('/')
        .slice(0, -1)
        .map(() => '..')
        .join('/') || '.';
      
      newContent = newContent.replace(/@\//g, `${relativePath}/`);
      modified = true;
    }

    if (modified) {
      await writeFile(filePath, newContent, 'utf8');
      console.log(`✅ Fixed imports in ${filePath.replace(process.cwd(), '')}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

async function processDirectory(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      
      if (entry.isDirectory()) {
        await processDirectory(fullPath);
      } else if (entry.isFile() && (extname(entry.name) === '.js' || extname(entry.name) === '.mjs')) {
        await processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`❌ Error reading directory ${directory}:`, error.message);
  }
}

console.log('🔧 Fixing import statements...');
processDirectory(DIST_DIR)
  .then(() => console.log('✨ Finished fixing imports'))
  .catch(error => {
    console.error('❌ Failed to fix imports:', error);
    process.exit(1);
  });
