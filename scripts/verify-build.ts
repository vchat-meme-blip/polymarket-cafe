/// <reference types="node" />

import { promises as fs } from 'fs';
import path from 'path';

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function verifyBuild() {
  try {
    const distDir = path.join(process.cwd(), 'dist');
    const serverDir = path.join(distDir, 'server');
    
    console.log('\n🔍 Verifying build output...');
    
    // Check if dist directory exists
    try {
      await fs.access(distDir);
      console.log('✅ dist/ directory exists');
    } catch {
      throw new Error('❌ dist/ directory does not exist. Build might have failed.');
    }
    
    // Check if server directory exists
    try {
      await fs.access(serverDir);
      console.log('✅ dist/server/ directory exists');
    } catch {
      throw new Error('❌ dist/server/ directory does not exist. Server build might have failed.');
    }
    
    // Check for required files
    const requiredFiles = [
      'index.js',
      'server.js',
      'package.json'
    ];
    
    let allFilesExist = true;
    for (const file of requiredFiles) {
      const filePath = path.join(serverDir, file);
      const exists = await checkFileExists(filePath);
      console.log(`${exists ? '✅' : '❌'} ${file} ${exists ? 'exists' : 'MISSING'}`);
      if (!exists) allFilesExist = false;
    }
    
    // List all .js files in dist/server
    console.log('\n📂 Contents of dist/server/:');
    try {
      const files = await fs.readdir(serverDir);
      const jsFiles = files.filter(file => file.endsWith('.js'));
      console.log('JavaScript files:', jsFiles.length > 0 ? jsFiles.join(', ') : 'None found');
      
      const tsFiles = files.filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'));
      if (tsFiles.length > 0) {
        console.warn('⚠️  Warning: Found TypeScript files in dist/server/:');
        console.warn('   ' + tsFiles.join(', '));
        console.warn('   These should be compiled to .js files. Check your TypeScript build configuration.');
      }
    } catch (error) {
      console.error('Error reading dist/server/ directory:', error);
    }
    
    if (!allFilesExist) {
      throw new Error('❌ Some required files are missing from the build.');
    }
    
    console.log('\n✅ Build verification complete. All required files are present.');
  } catch (error) {
    console.error('\n❌ Build verification failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run verification
verifyBuild();
