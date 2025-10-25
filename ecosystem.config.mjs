export default {
  apps: [{
    name: "quants-cafe",
    cwd: "/app/dist/server",  // <-- IMPORTANT: Change CWD to the server build output directory
    script: "index.js",  // <-- IMPORTANT: Script is now directly in CWD
    interpreter: "node",  // Use Node.js as interpreter
    // REMOVED: node_args: "--import=tsx", // <-- IMPORTANT: Remove tsx dependency in production
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "development",
      PORT: 3001,
      HOST: "0.0.0.0",
      DOCKER_ENV: "true",
      NODE_PATH: "/app/node_modules" // Still useful for resolving modules
    },
    env_production: {
      NODE_ENV: "production",
      PORT: 3001,
      HOST: "0.0.0.0",
      DOCKER_ENV: "true",
      NODE_PATH: "/app/node_modules"
    },
    error_file: "/app/logs/error.log",
    out_file: "/app/logs/out.log",
    merge_logs: true,
    time: true,
    max_memory_restart: "1G",
    watch: false,
    ignore_watch: ["node_modules", "logs", ".git"],
    max_restarts: 10,
    min_uptime: "5s",
    // Add pre-start script to ensure directories exist
    pre_start: "mkdir -p /app/logs /app/dist/server/workers"
  }]
};