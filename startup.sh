#!/bin/sh
set -e

# Kill any existing node processes to prevent multiple instances
echo "🔍 Checking for existing Node.js processes..."
pkill -f "node.*dist/server" || true
pkill -f "pm2" || true
pkill -f "health-server.js" || true
# Small delay to ensure processes are fully terminated
sleep 2

# Start health check server in the background
echo "🚀 Starting health check server on port 3002..."
node health-server.js &

# Small delay to ensure health server is up
sleep 2

# Print environment for debugging
echo "🔍 Environment variables:"
printenv

# Default entry point
ENTRYPOINT="/app/dist/server/server/index.js"

# Check if the entry point exists, if not, try alternatives
if [ ! -f "$ENTRYPOINT" ]; then
    echo "Primary entry point not found, trying alternatives..."
    
    # List of possible entry points in order of preference
    POSSIBLE_ENTRIES=(
        "/app/dist/server/index.js"
        "/app/dist/server/load-env.js"
        "/app/dist/server/startup.js"
        "/app/dist/index.js"
    )
    
    # Try to find a valid entry point
    for entry in "${POSSIBLE_ENTRIES[@]}"; do
        if [ -f "$entry" ]; then
            ENTRYPOINT="$entry"
            echo "🚀 Found entry point at: $ENTRYPOINT"
            break
        fi
    done
    
    if [ ! -f "$ENTRYPOINT" ]; then
        echo "Error: No valid entry point found. Tried:"
        for entry in "/app/dist/server/index.js" "/app/dist/server/load-env.js" "/app/dist/server/startup.js" "/app/dist/index.js"; do
            echo "  - $entry"
        done
        echo "Directory contents of /app/dist:"
        find /app/dist -type f
        exit 1
    fi
else
    echo "Using entry point: $ENTRYPOINT"
fi

# Make sure the file is executable
chmod +x "$ENTRYPOINT"

# Start the application
echo "🚀 Starting application with: node $ENTRYPOINT"
exec node --no-warnings "$ENTRYPOINT"
