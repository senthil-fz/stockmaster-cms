// PM2 process definition for the StockMaster API (production).
// Lives at /home/deploy/stockmaster/ecosystem.config.cjs on the server (outside
// the rsync --delete tree). Started/reloaded by deploy/remote-release.sh.
//
// Entry is dist/src/main.js (nest compiles to dist/src/* because the prisma
// scripts pull the tsc root up — NOT dist/main.js).
// Env is loaded by Node's --env-file from the secrets file written by CI.
module.exports = {
  apps: [
    {
      name: 'stockmaster-api',
      cwd: '/var/www/api.stockmasternagaraj.com',
      script: 'dist/src/main.js',
      interpreter: 'node',
      interpreter_args: '--env-file=/home/deploy/stockmaster/api.env',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
