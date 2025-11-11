/// <reference types="node" />

import { promises as fs, existsSync } from 'fs';
import * as path from 'path';

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
  await fs.copyFile(src, dest);
  console.log(`Copied ${path.relative(process.cwd(), src)} to ${path.relative(process.cwd(), dest)}`);
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

    console.log(`Copying server files from ${srcDir} to ${destDir}`);
    
    // Ensure destination directory exists
    await ensureDirectoryExists(destDir);

    // Copy all files from server to dist/server, excluding common directories
    await copyDirRecursive(srcDir, destDir, [
      'node_modules',
      '__tests__',
      'test',
      'coverage',
      '.github',
      '.vscode'
    ]);

    // Copy essential root files
    const rootFiles = [
      'package.json',
      'package-lock.json',
      '.env',
      '.env.production',
      '.env.development',
      '.env.local',
      'ecosystem.config.cjs'
    ];

    // Handle compiled .js and .d.ts files
    const compiledDirs = [
      'server',
      'routes',
      'services',
      'directors',
      'workers'
    ];

    // Copy compiled files from dist/server/server to dist/server
    for (const dir of compiledDirs) {
      const srcPath = path.join(process.cwd(), 'dist', 'server', 'server', dir);
      const destPath = path.join(process.cwd(), 'dist', 'server', dir);
      
      try {
        if (existsSync(srcPath)) {
          await copyDirRecursive(srcPath, destPath);
          console.log(`✅ Copied compiled ${dir} directory`);
        }
      } catch (error: any) {
        console.warn(`⚠️  Could not copy ${dir} directory:`, error.message);
      }
    }

    for (const file of rootFiles) {
      try {
        const srcPath = path.join(process.cwd(), file);
        const destPath = path.join(destDir, file);
        await fs.copyFile(srcPath, destPath);
        console.log(`Copied ${file} to dist/server/`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        console.warn(`Skipping ${file}: not found`);
      }
    }

    // Ensure index.js exists (copy from server.js if needed)
    const indexPath = path.join(destDir, 'index.js');
    const serverPath = path.join(destDir, 'server.js');
    
    try {
      await fs.access(indexPath);
      console.log('index.js already exists');
    } catch {
      try {
        await fs.copyFile(serverPath, indexPath);
        console.log(`Created index.js from server.js`);
      } catch (error) {
        console.error('Failed to create index.js:', error);
        throw new Error('Could not create index.js entry point');
      }
    }

    console.log('✅ Server files copied successfully');
  } catch (error) {
    console.error('❌ Error copying server files:', error);
    process.exit(1);
  }
}

// Run the copy process
(async () => {
  try {
    await copyServerFiles();
    // Explicitly exit to ensure the process doesn't hang
    process.exit(0);
  } catch (error) {
    console.error('Unhandled error in copy-server-files:', error);
    process.exit(1);
  }
})();
