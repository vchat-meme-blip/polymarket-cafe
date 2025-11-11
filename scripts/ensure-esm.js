import { readFile, writeFile, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promisify } from 'util';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, '..', 'dist', 'server');

/**
 * Ensures ESM imports are properly set up in the compiled files
 */
async function ensureESMImports() {
  try {
    // Process index.js
    const indexPath = join(serverPath, 'index.js');
    await processFile(indexPath);

    // Process startup.js
    const startupPath = join(serverPath, 'server', 'startup.js');
    await processFile(startupPath);

    console.log('ESM import verification completed successfully');
  } catch (error) {
    console.error('Error ensuring ESM imports:', error);
    process.exit(1);
  }
}

/**
 * Processes a file to ensure it has proper ESM imports
 * @param {string} filePath - Path to the file to process
 */
async function processFile(filePath) {
  if (!existsSync(filePath)) {
    console.log(`File not found, skipping: ${filePath}`);
    return;
  }

  try {
    let content = await readFileAsync(filePath, 'utf8');
    let modified = false;

    // Add ESM imports if not present
    if (content.includes('__filename') || content.includes('__dirname')) {
      const esmShim = `import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`;
      
      // Only add if not already present
      if (!content.includes('const __filename = fileURLToPath(import.meta.url)')) {
        content = esmShim + content;
        modified = true;
      }
    }

    // Fix .js imports to include .js extension
    content = content.replace(
      /from\s+['"]([^'"]+)['"]/g,
      (match, importPath) => {
        // Skip if already has an extension or is a node module
        if (importPath.startsWith('.')) {
          if (!importPath.endsWith('.js') && 
              !importPath.endsWith('.json') && 
              !importPath.endsWith('.node')) {
            modified = true;
            return `from "${importPath}.js"`;
          }
        }
        return match;
      }
    );

    // Write the file back if it was modified
    if (modified) {
      await writeFileAsync(filePath, content, 'utf8');
      console.log(`Updated: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    throw error; // Re-throw to be handled by the caller
  }
}

// Run the script
ensureESMImports();

console.log('ESM compatibility check complete!');
