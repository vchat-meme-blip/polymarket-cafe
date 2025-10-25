const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const rename = promisify(fs.rename);
const unlink = promisify(fs.unlink);

async function fixWorkerExtensions(dir) {
  try {
    const files = await readdir(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      
      if (file.isDirectory()) {
        await fixWorkerExtensions(fullPath);
      } else if (file.name.endsWith('.mjs')) {
        // Rename .mjs to .js
        const newPath = fullPath.replace(/\.mjs$/, '.js');
        console.log(`Renaming ${fullPath} to ${newPath}`);
        
        // Remove the .js file if it already exists
        try {
          await unlink(newPath);
        } catch (err) {
          // File doesn't exist, that's fine
          if (err.code !== 'ENOENT') throw err;
        }
        
        await rename(fullPath, newPath);
      }
    }
  } catch (err) {
    console.error('Error fixing worker extensions:', err);
    process.exit(1);
  }
}

// Fix extensions in the workers directory
fixWorkerExtensions(path.join(__dirname, '../dist/server/workers'));
