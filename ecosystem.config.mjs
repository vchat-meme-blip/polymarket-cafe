
export default {
  apps: [{
    name: "quants-cafe",
    cwd: "/app",  // Use absolute path in container
    script: "dist/server/index.js",  // Main script to run
    interpreter: "node",  // Use Node.js as interpreter
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "development",
      PORT: 3001,
      HOST: "0.0.0.0",
      DOCKER_ENV: "true",
      NODE_PATH: "/app/node_modules"
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