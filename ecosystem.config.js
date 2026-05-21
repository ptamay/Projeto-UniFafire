module.exports = {
  apps: [
    {
      name: "unifafire",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0",
      cwd: "e:\\Projeto UniFafire",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "e:\\Projeto UniFafire\\logs\\app.log",
      error_file: "e:\\Projeto UniFafire\\logs\\error.log",
      merge_logs: true,
    },
  ],
};
