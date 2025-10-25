const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isProduction = process.env.NODE_ENV === 'production';
const rootDir = path.resolve(__dirname, '..');
const srcWorkersDir = path.join(rootDir, 'server', 'workers');
const distDir = path.join(rootDir, 'dist');
const distWorkersDir = path.join(distDir, 'server', 'workers');

// Ensure dist directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Clean and recreate dist directory
function cleanDist() {
  console.log('Cleaning dist directory...');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  ensureDir(distWorkersDir);
}

// Build TypeScript workers
function buildWorkers() {
  console.log('Building workers...');
  
  // Get all worker files
  const workerFiles = fs.readdirSync(srcWorkersDir)
    .filter(file => file.endsWith('.worker.ts'));
  
  if (workerFiles.length === 0) {
    console.warn('No worker files found in', srcWorkersDir);
    return;
  }
  
  console.log(`Found ${workerFiles.length} worker files`);
  
  // Build each worker file
  workerFiles.forEach(file => {
    const workerName = path.basename(file, '.ts');
    const srcPath = path.join(srcWorkersDir, file);
    const distPath = path.join(distWorkersDir, `${workerName}.mjs`);
    
    console.log(`Building ${file}...`);
    
    try {
      // Use TypeScript compiler API to transpile to ESM
      const { compile } = require('@babel/core');
      const result = compile(fs.readFileSync(srcPath, 'utf8'), {
        filename: file,
        presets: [
          ['@babel/preset-typescript', { allExtensions: true }],
          ['@babel/preset-env', { 
            targets: { node: 'current' },
            modules: false
          }]
        ],
        plugins: [
          '@babel/plugin-transform-modules-commonjs',
          ['@babel/plugin-transform-runtime', { useESModules: true }]
        ]
      });
      
      // Ensure the output is ESM-compatible
      let code = result.code;
      code = code.replace(/require\(/g, 'await import(');
      
      // Add ESM export if missing
      if (!code.includes('export {')) {
        code += '\n//# sourceMappingURL=' + workerName + '.mjs.map';
      }
      
      // Write the compiled worker
      fs.writeFileSync(distPath, code, 'utf8');
      console.log(`Built ${distPath}`);
      
      // Copy source maps if they exist
      const sourceMapPath = srcPath + '.map';
      if (fs.existsSync(sourceMapPath)) {
        fs.copyFileSync(sourceMapPath, distPath + '.map');
      }
      
    } catch (error) {
      console.error(`Error building ${file}:`, error);
      process.exit(1);
    }
  });
}

// Main build function
function main() {
  try {
    console.log('Starting worker build process...');
    console.log('Environment:', isProduction ? 'production' : 'development');
    
    cleanDist();
    buildWorkers();
    
    console.log('Worker build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
