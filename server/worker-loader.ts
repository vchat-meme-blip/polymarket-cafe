import { Worker, WorkerOptions } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory name in an ESM-compatible way
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWorker(workerPath: string, options?: WorkerOptions) {
  const isDev = process.env.NODE_ENV !== 'production';
  const isDocker = process.env.DOCKER_ENV === 'true';
  
  const workerOptions: WorkerOptions = {
    ...options,
    workerData: {
      ...(options?.workerData || {})
    },
    execArgv: [
      ...(options?.execArgv || []),
      ...(isDev ? ['--loader', 'ts-node/esm'] : [])
    ]
  };

  let finalPath: string;
  
  if (isDev) {
    // In development, use the TypeScript files directly
    const resolvedPath = path.resolve(__dirname, workerPath);
    finalPath = !workerPath.endsWith('.ts') && !workerPath.endsWith('.js')
      ? `${resolvedPath}.ts`
      : resolvedPath;
  } else {
    // In production, handle Docker environment
    const basePath = isDocker ? '/app/dist' : path.resolve(__dirname, '..');
    const workerName = path.basename(workerPath, '.worker');
    
    // First, try to find the worker file in the filesystem
    const fs = require('fs');
    
    // Function to find a file in a directory with any extension
    const findFile = (dir: string, baseName: string): string | null => {
      try {
        if (!fs.existsSync(dir)) {
          console.log(`[Worker Loader] Directory does not exist: ${dir}`);
          return null;
        }
        const files = fs.readdirSync(dir);
        console.log(`[Worker Loader] Files in ${dir}:`, files);
        const found = files.find((file: string) => {
          const name = path.basename(file, path.extname(file));
          return name === baseName || name === `${baseName}.worker`;
        });
        return found || null;
      } catch (e) {
        console.error(`[Worker Loader] Error reading directory ${dir}:`, e);
        return null;
      }
    };
    
    // Define all possible worker directories to check
    const possibleDirs = [
      path.join(basePath, 'workers'),
      path.join(basePath, 'server/workers'),
      path.join(basePath, 'server/dist/workers'),
      '/app/dist/workers',
      '/app/dist/server/workers'
    ];
    
    console.log('[Worker Loader] Searching for worker in directories:', possibleDirs);
    
    // Try to find the worker file in any of the possible directories
    let foundPath: string | null = null;
    
    for (const dir of possibleDirs) {
      if (!fs.existsSync(dir)) {
        console.log(`[Worker Loader] Directory does not exist: ${dir}`);
        continue;
      }
      
      const workerFile = findFile(dir, workerName);
      if (workerFile) {
        foundPath = path.join(dir, workerFile);
        console.log(`[Worker Loader] Found worker at: ${foundPath}`);
        break;
      }
    }
    
    // If not found, try with common extensions
    if (!foundPath) {
      console.log('[Worker Loader] Worker not found in any directory, trying with extensions...');
      const extensions = ['.mjs', '.js', '.cjs', ''];
      const baseNames = [
        workerName,
        `${workerName}.worker`,
        path.basename(workerName, '.worker')
      ];
      
      for (const dir of possibleDirs) {
        if (!fs.existsSync(dir)) continue;
        
        for (const name of baseNames) {
          for (const ext of extensions) {
            const testPath = path.join(dir, `${name}${ext}`);
            if (fs.existsSync(testPath)) {
              foundPath = testPath;
              console.log(`[Worker Loader] Found worker with extension at: ${foundPath}`);
              break;
            }
          }
          if (foundPath) break;
        }
        if (foundPath) break;
      }
    }
    
    if (!foundPath) {
      // Last resort: try to find any file that contains the worker name
      console.log('[Worker Loader] Worker not found with standard patterns, trying broader search...');
      for (const dir of possibleDirs) {
        if (!fs.existsSync(dir)) continue;
        
        try {
          const files = fs.readdirSync(dir);
          const matchingFile = files.find(file => 
            file.toLowerCase().includes(workerName.toLowerCase())
          );
          
          if (matchingFile) {
            foundPath = path.join(dir, matchingFile);
            console.log(`[Worker Loader] Found potential worker file: ${foundPath}`);
            break;
          }
        } catch (e) {
          console.error(`[Worker Loader] Error searching in ${dir}:`, e);
        }
      }
    }
    
    if (!foundPath) {
      const errorMsg = `Worker file not found for ${workerName}. ` +
        `Searched in: ${possibleDirs.join(', ')}`;
      console.error('[Worker Loader]', errorMsg);
      throw new Error(errorMsg);
    }
    
    finalPath = foundPath;
    console.log('[Worker Loader] Final worker path:', finalPath);
  }

  console.log(`[Worker Loader] Starting worker at: ${finalPath}`);
  
  try {
    const worker = new Worker(finalPath, workerOptions);
    
    worker.on('error', (error) => {
      console.error(`[Worker ${worker.threadId}] Error:`, error);
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[Worker ${worker.threadId}] stopped with exit code ${code}`);
      }
    });
    
    return worker;
  } catch (error) {
    console.error(`[Worker Loader] Failed to start worker at ${finalPath}:`, error);
    throw error;
  }
}