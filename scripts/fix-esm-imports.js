import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Fixes ESM imports and adds necessary shims to a file
 * @param {string} filePath - Path to the file to process
 */
async function fixImportsInFile(filePath) {
  try {
    // Read the file content
    let content = await readFile(filePath, 'utf8');
    let modified = false;

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

    // Add ESM shim for __filename and __dirname if they're used
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

    // Write the file back if it was modified
    if (modified) {
      await writeFile(filePath, content, 'utf8');
      console.log(`Updated: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

/**
 * Processes all JavaScript files in a directory
 * @param {string} directory - Directory to process
 */
async function processDirectory(directory) {
  try {
    // Find all .js files in the directory
    const files = await glob('**/*.js', { 
      cwd: directory,
      absolute: true,
      nodir: true,
      ignore: ['**/node_modules/**']
    });

    // Process each file
    for (const file of files) {
      await fixImportsInFile(file);
    }
  } catch (error) {
    console.error(`Error processing directory ${directory}:`, error);
  }
}

// Main execution
async function main() {
  try {
    // Get the target directory from command line arguments or use default
    const targetDir = process.argv[2] || join(process.cwd(), 'dist', 'server');
    
    console.log('Fixing ESM imports in:', targetDir);
    await processDirectory(targetDir);
    console.log('ESM import fixing completed!');
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

// Run the script
main();
