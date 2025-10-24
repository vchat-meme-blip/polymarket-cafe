const path = require('path');

module.exports = {
  apps: [{
    name: "quants-cafe",
    script: "tsx",
    args: "server/index.ts",
    interpreter: "node",
    instances: 1,
    exec_mode: "fork",
    cwd: __dirname,
    env: {
      NODE_ENV: "development",
      PORT: 3000,
      HOST: "0.0.0.0"
    },
    env_production: {
      NODE_ENV: "production",
      PORT: 3000,
      HOST: "0.0.0.0"
    },
    error_file: path.join(__dirname, 'logs/error.log'),
    out_file: path.join(__dirname, 'logs/out.log'),
    merge_logs: true,
    time: true,
    max_memory_restart: "1G",
    watch: false,
    ignore_watch: ["node_modules", "logs", ".git"],
    max_restarts: 10,
    min_uptime: "5s"
  }]
};
