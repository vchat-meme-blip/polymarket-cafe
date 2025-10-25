export default {
  apps: [{
    name: "quants-cafe",
    cwd: "/app",  // Use absolute path in container
    script: "dist/server/index.js",  // Main script to run
    interpreter: "node",  // Use Node.js as interpreter
    node_args: "--import=tsx",  // Pass Node.js arguments here
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "development",
      PORT: 3001,
      HOST: "0.0.0.0"
    },
    env_production: {
      NODE_ENV: "production",
      PORT: 3001,
      HOST: "0.0.0.0"
    },
    error_file: "./logs/error.log",
    out_file: "./logs/out.log",
    merge_logs: true,
    time: true,
    max_memory_restart: "1G",
    watch: false,
    ignore_watch: ["node_modules", "logs", ".git"],
    max_restarts: 10,
    min_uptime: "5s"
  }]
};