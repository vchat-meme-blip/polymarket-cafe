import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = join(__dirname, '..', 'dist', 'server', 'server');
const targetDir = join(__dirname, '..', 'dist', 'server');
const workersSourceDir = join(__dirname, '..', 'dist', 'server', 'workers');
const workersTargetDir = join(__dirname, '..', 'dist', 'workers');

// Create target directories if they don't exist
[targetDir, workersTargetDir].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

// Function to copy files recursively
function copyRecursiveSync(src, dest) {
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    if (entry.isDirectory()) {
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      copyRecursiveSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

// Copy server files
if (existsSync(sourceDir)) {
  console.log('Copying server files...');
  copyRecursiveSync(sourceDir, targetDir);
  console.log('Server files copied successfully!');
} else {
  console.warn(`Source directory not found: ${sourceDir}`);
}

// Copy worker files
if (existsSync(workersSourceDir)) {
  console.log('Copying worker files...');
  copyRecursiveSync(workersSourceDir, workersTargetDir);
  console.log('Worker files copied successfully!');
} else {
  console.warn(`Workers directory not found: ${workersSourceDir}`);
}

console.log('File copy operation completed.');