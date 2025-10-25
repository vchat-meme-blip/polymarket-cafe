#!/bin/sh
set -e

# Scope transformations to the compiled server output so client assets remain untouched
SERVER_DIST_DIR="dist/server"

if [ -d "$SERVER_DIST_DIR" ]; then
  # Find all .js files in the server bundle and rename them to .mjs
  find "$SERVER_DIST_DIR" -type f -name "*.js" | while read -r file; do
    mv "$file" "${file%.js}.mjs"
  done

  # Update import specifiers that still reference .js files
  find "$SERVER_DIST_DIR" -type f -name "*.mjs" -exec sed -i.bak \
    -e "s/\(from ['\"]\([^'\"]\+\)\)\.js\(['\"]\)/\1.mjs\3/g" \
    -e "s/^\(import ['\"]\([^'\"]\+\)\)\.js\(['\"]\)/\1.mjs\3/g" {} \;

  # Fix any remaining .ts imports in .mjs files
  find "$SERVER_DIST_DIR" -type f -name "*.mjs" -exec sed -i.bak -E "s/\.ts(['\"])/.mjs\1/g" {} \;
  find "$SERVER_DIST_DIR" -name "*.mjs.bak" -delete
else
  echo "⚠️  Server dist directory '$SERVER_DIST_DIR' not found; skipping import fixes"
fi

echo "✅ Fixed file extensions and imports"
