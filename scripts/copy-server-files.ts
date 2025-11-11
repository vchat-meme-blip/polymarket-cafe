/// <reference types="node" />

import { promises as fs, existsSync, createReadStream, createWriteStream } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';

async function ensureDirectoryExists(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function copyFileWithDir(src: string, dest: string) {
  await ensureDirectoryExists(path.dirname(dest));
  
  // Skip if source and destination are the same
  if (src === dest) {
    return;
  }
  
  try {
    const source = createReadStream(src);
    const destStream = createWriteStream(dest);
    
    await pipeline(source, destStream);
    console.log(`Copied ${path.relative(process.cwd(), src)} to ${path.relative(process.cwd(), dest)}`);
  } catch (error) {
    console.error(`Error copying ${src} to ${dest}:`, error);
    throw error;
  }
}

async function copyDirRecursive(src: string, dest: string, exclude: string[] = []) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  const operations = [];
  
  for (const entry of entries) {
    // Skip excluded directories/files
    if (['node_modules', '.git', 'dist', 'build', '.DS_Store', ...exclude].includes(entry.name)) {
      console.log(`Skipping: ${entry.name}`);
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      operations.push(
        ensureDirectoryExists(destPath)
          .then(() => copyDirRecursive(srcPath, destPath, exclude))
      );
    } else {
      // Handle file copy operations
      operations.push((async () => {
        // Skip .ts files but copy their .js and .d.ts counterparts
        if (entry.name.endsWith('.ts')) {
          // If it's a .d.ts file, copy it
          if (entry.name.endsWith('.d.ts')) {
            await copyFileWithDir(srcPath, destPath);
          }
          // Skip the .ts file as it should be compiled to .js
          return;
        }
        
        // Copy all other files
        await copyFileWithDir(srcPath, destPath);
        
        // If this is a .js file, check for and copy the corresponding .d.ts file
        if (entry.name.endsWith('.js')) {
          const dtsPath = srcPath.replace(/\.js$/, '.d.ts');
          try {
            await fs.access(dtsPath);
            await copyFileWithDir(dtsPath, destPath.replace(/\.js$/, '.d.ts'));
          } catch {
            // No .d.ts file, that's fine
          }
        }
      })());
    }
  }
  
  // Wait for all operations to complete
  await Promise.all(operations);
}

async function copyServerFiles() {
  try {
    const srcDir = path.join(process.cwd(), 'server');
    const destDir = path.join(process.cwd(), 'dist', 'server');
    const tempDir = path.join(process.cwd(), 'dist', 'temp');

    console.log(`📂 Copying server files from ${srcDir} to ${destDir}`);
    
    // Create a temporary directory for atomic operations
    await ensureDirectoryExists(tempDir);
    
    // Copy all files from server to temp directory first
    await copyDirRecursive(srcDir, tempDir, [
      'node_modules',
      '__tests__',
      'test',
      'coverage',
      '.github',
      '.vscode',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.d.ts'
    ]);

    // Handle compiled .js and .d.ts files
    const compiledDirs = [
      'server',
      'routes',
      'services',
      'directors',
      'workers'
    ];

    // Copy compiled files from dist/server/server to temp directory
    for (const dir of compiledDirs) {
      const srcPath = path.join(process.cwd(), 'dist', 'server', 'server', dir);
      const destPath = path.join(tempDir, dir);
      
      try {
        if (existsSync(srcPath)) {
          console.log(`📦 Copying compiled ${dir} directory...`);
          await copyDirRecursive(srcPath, destPath);
          console.log(`✅ Copied compiled ${dir} directory`);
        }
      } catch (error: any) {
        console.warn(`⚠️  Could not copy ${dir} directory:`, error.message);
      }
    }

    // Copy essential root files to temp directory
    const rootFiles = [
      'package.json',
      'package-lock.json',
      '.env',
      '.env.production',
      '.env.development',
      '.env.local',
      'ecosystem.config.cjs'
    ];

    console.log('📄 Copying root files...');
    for (const file of rootFiles) {
      try {
        const srcPath = path.join(process.cwd(), file);
        const destPath = path.join(tempDir, file);
        
        if (existsSync(srcPath)) {
          await copyFileWithDir(srcPath, destPath);
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(`⚠️  Error copying ${file}:`, error.message);
        }
      }
    }

    // Ensure index.js exists in temp directory
    const indexPath = path.join(tempDir, 'index.js');
    const serverPath = path.join(tempDir, 'server.js');
    
    if (!existsSync(indexPath) && existsSync(serverPath)) {
      try {
        await copyFileWithDir(serverPath, indexPath);
        console.log(`✅ Created index.js from server.js`);
      } catch (error) {
        console.error('❌ Failed to create index.js:', error);
        throw new Error('Could not create index.js entry point');
      }
    }

    // Atomically replace the destination directory
    console.log('🔄 Finalizing file copy...');
    
    // Remove existing destination directory if it exists
    if (existsSync(destDir)) {
      try {
        await fs.rm(destDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('⚠️  Could not remove existing destination directory:', error);
      }
    }
    
    // Rename temp directory to destination
    await fs.rename(tempDir, destDir);

    console.log('✅ Server files copied successfully');
  } catch (error) {
    console.error('❌ Error copying server files:', error);
    process.exit(1);
  }
}

// Run the copy process with proper cleanup
(async () => {
  try {
    console.log('🚀 Starting file copy process...');
    const startTime = Date.now();
    
    await copyServerFiles();
    
    const endTime = Date.now();
    console.log(`✨ File copy completed successfully in ${((endTime - startTime) / 1000).toFixed(2)}s`);
    
    // Force exit to prevent hanging
    process.exit(0);
  } catch (error) {
    console.error('❌ Unhandled error in copy-server-files:', error);
    // Force exit even if there's an error
    process.exit(1);
  }
})();
