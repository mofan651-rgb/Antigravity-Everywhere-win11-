import { spawnSync } from 'node:child_process';

const res = spawnSync(
  process.execPath,
  ['node_modules/tsx/dist/cli.mjs', 'server.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'production',
      PYTHONUTF8: process.env.PYTHONUTF8 || '1',
    },
  },
);

process.exit(res.status ?? 0);
