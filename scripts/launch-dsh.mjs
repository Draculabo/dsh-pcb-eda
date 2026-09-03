#!/usr/bin/env node
/**
 * Cross-platform equivalent of the bash start script.
 * Kills any process listening on port 3080, registers the local dsh plugins,
 * then starts the dsh web server.
 *
 * Run from the project/git root:
 *   node scripts/start-dsh-web.js
 *   # or after chmod +x:
 *   ./scripts/start-dsh-web.js
 */

'use strict';

// const { execSync, spawn } = require('child_process');
// const os = require('os');
// const path = require('path');

import { execSync ,spawn} from 'child_process';
import { accessSync } from 'fs';
import os from 'os';
import path from 'path';

const PORT = 3080;
const PROFILE = 'web';

const PLUGINS = [
  './packages/dsh-auth',
  './packages/dsh-artifacts',
  './packages/dsh-tool-part-search',
  './packages/dsh-tool-symbol-footprint',
  './packages/dsh-tool-schematic-gen',
];

/**
 * Kill any process currently listening on the given port.
 * Silently ignores the case where nothing is listening.
 */
function killPort(port) {
  const platform = os.platform();

  try {
    if (platform === 'win32') {
      // Find PIDs listening on the port, then force-kill them.
      // netstat output lines look like:
      //   TCP    0.0.0.0:3080    0.0.0.0:0    LISTENING    12345
      const output = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      const pids = new Set();
      for (const line of output.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
          pids.add(pid);
        }
      }

      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`Killed process ${pid} on port ${port}`);
        } catch {
          // process may already have exited
        }
      }
    } else {
      // macOS / Linux
      try {
        const pids = execSync(`lsof -ti:${port}`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        })
          .trim()
          .split(/\s+/)
          .filter(Boolean);

        if (pids.length) {
          execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'ignore' });
          console.log(`Killed process(es) ${pids.join(', ')} on port ${port}`);
        }
      } catch {
        // lsof exits non-zero when nothing is listening – ignore
      }
    }
  } catch {
    // netstat / findstr may also exit non-zero when no match – ignore
  }
}

/**
 * Run a command and inherit stdio so the user sees live output.
 * Throws if the command exits with a non-zero status.
 */
function run(cmd, args = []) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execSync(`${cmd} ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
    shell: true, // needed for npx on Windows
  });
}

function main() {
  // Ensure we are running from a directory that looks like the project root
  // (has a packages/ folder). This is only a soft check.
  const packagesDir = path.join(process.cwd(), 'packages');
  try {
    accessSync(packagesDir);
  } catch {
    console.warn(
      'Warning: ./packages not found in current working directory.\n' +
        'Please run this script from the project/git root.'
    );
  }

  console.log(`Freeing port ${PORT}…`);
  killPort(PORT);

  for (const plugin of PLUGINS) {
    run('npx', [
      '@deepseek-ai/dsh',
      'plugin',
      '--profile',
      PROFILE,
      'add',
      plugin,
    ]);
  }

  console.log('Starting dsh web…');
  // Final command should keep the process alive, so we spawn it without waiting.
  const child = spawn(
    'npx',
    ['@deepseek-ai/dsh', 'web'],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
      shell: true,
    }
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });

  // Forward termination signals to the child
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      if (!child.killed) child.kill(sig);
    });
  }
}

main();
