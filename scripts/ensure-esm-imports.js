import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const serverDir = join(distDir, 'server');

// Ensure ESM shims are present in all JS files
async function ensureEsmImports() {
  const jsFiles = await glob('**/*.js', { 
    cwd: serverDir, 
    absolute: true,
    ignore: ['**/node_modules/**']
  });

  for (const file of jsFiles) {
    let content = await readFile(file, 'utf-8');
    let modified = false;

    // Add ESM shims if not present
    if ((content.includes('__filename') || content.includes('__dirname')) && 
        !content.includes('const __filename = fileURLToPath(import.meta.url)')) {
      const esmShim = `import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);\n\n`;
      content = esmShim + content;
      modified = true;
    }

    // Fix local imports to include .js extension
    content = content.replace(
      /from\s+['"](\..*?)(?<!\.js)['"]/g,
      (match, p1) => `from '${p1}.js'`
    );

    if (modified) {
      await writeFile(file, content, 'utf-8');
      console.log(`Updated: ${relative(rootDir, file)}`);
    }
  }
}

// Copy necessary files to dist directory
async function copyRequiredFiles() {
  const filesToCopy = [
    'lib/**/*',
    'public/**/*',
    '*.json',
    '*.env*',
    '.env*'
  ];

  for (const pattern of filesToCopy) {
    const matches = await glob(pattern, { 
      cwd: rootDir,
      ignore: ['**/node_modules/**', '**/dist/**']
    });

    for (const src of matches) {
      const srcPath = join(rootDir, src);
      const destPath = join(distDir, src);
      
      // Ensure destination directory exists
      await mkdir(dirname(destPath), { recursive: true });
      
      // Copy file
      await copyFile(srcPath, destPath);
      console.log(`Copied: ${src} -> ${relative(rootDir, destPath)}`);
    }
  }
}

// Main function
async function main() {
  try {
    console.log('Ensuring ESM imports...');
    await ensureEsmImports();
    
    console.log('\nCopying required files...');
    await copyRequiredFiles();
    
    console.log('\nBuild preparation completed successfully!');
  } catch (error) {
    console.error('Error during build preparation:', error);
    process.exit(1);
  }
}

main();
