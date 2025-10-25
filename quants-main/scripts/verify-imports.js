#!/usr/bin/env node
import { readFile, readdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_DIR = join(process.cwd(), 'dist', 'server');
const NODE_MODULES = join(process.cwd(), 'node_modules');

async function checkFileImports(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    const dynamicImports = /import\(['"]([^'"]+)['"]\)/g;
    
    let match;
    const imports = new Set();
    
    // Find all imports
    while ((match = importRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
    
    // Find all requires
    while ((match = requireRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
    
    // Find dynamic imports
    while ((match = dynamicImports.exec(content)) !== null) {
      imports.add(match[1]);
    }
    
    // Check each import
    for (const imp of imports) {
      // Skip built-in modules and node: imports
      if (imp.startsWith('node:') || imp.startsWith('http') || imp.startsWith('https') || imp.startsWith('file:')) {
        continue;
      }
      
      // Skip relative paths that don't have an extension (handled by Node.js)
      if ((imp.startsWith('./') || imp.startsWith('../')) && !imp.endsWith('.js') && !imp.endsWith('.mjs')) {
        continue;
      }
      
      let resolvedPath;
      
      // Handle relative paths
      if (imp.startsWith('./') || imp.startsWith('../')) {
        resolvedPath = resolve(dirname(filePath), imp);
      } 
      // Handle absolute paths from project root
      else if (imp.startsWith('/')) {
        resolvedPath = join(process.cwd(), imp);
      }
      // Handle node modules
      else {
        resolvedPath = join(NODE_MODULES, imp);
      }
      
      // Check if the file exists
      try {
        // Try with .js extension if not present
        if (!imp.endsWith('.js') && !imp.endsWith('.mjs')) {
          try {
            await readFile(`${resolvedPath}.js`, 'utf8');
            continue;
          } catch {
            // Try with /index.js
            try {
              await readFile(join(resolvedPath, 'index.js'), 'utf8');
              continue;
            } catch {
              // Continue to the next check
            }
          }
        }
        
        // Try the exact path
        await readFile(resolvedPath, 'utf8');
      } catch (error) {
        console.error(`❌ Missing import in ${filePath.replace(process.cwd(), '')}:`);
        console.error(`   ${imp}`);
        console.error(`   Tried: ${resolvedPath}`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error checking imports in ${filePath}:`, error.message);
    return false;
  }
}

async function checkDirectory(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    let allImportsValid = true;
    
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      
      if (entry.isDirectory()) {
        const dirResult = await checkDirectory(fullPath);
        allImportsValid = allImportsValid && dirResult;
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
        const fileResult = await checkFileImports(fullPath);
        allImportsValid = allImportsValid && fileResult;
      }
    }
    
    return allImportsValid;
  } catch (error) {
    console.error(`❌ Error checking directory ${directory}:`, error.message);
    return false;
  }
}

console.log('🔍 Verifying imports...');
checkDirectory(SERVER_DIR)
  .then(success => {
    if (success) {
      console.log('✅ All imports are valid');
      process.exit(0);
    } else {
      console.error('❌ Some imports could not be resolved');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Failed to verify imports:', error);
    process.exit(1);
  });
