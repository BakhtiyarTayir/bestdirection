import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 50;

function parseNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseArgs(argv) {
  const forwardedArgs = [];
  let requestedPort = parseNumber(process.env.PORT) ?? DEFAULT_PORT;
  let hostname = process.env.HOSTNAME;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--port' || arg === '-p') {
      const value = argv[index + 1];
      const parsedPort = value ? parseNumber(value) : null;

      if (parsedPort) {
        requestedPort = parsedPort;
      }

      index += 1;
      continue;
    }

    if (arg.startsWith('--port=')) {
      const parsedPort = parseNumber(arg.slice('--port='.length));

      if (parsedPort) {
        requestedPort = parsedPort;
      }

      continue;
    }

    if (arg === '--hostname' || arg === '-H') {
      const value = argv[index + 1];

      if (value) {
        hostname = value;
        forwardedArgs.push(arg, value);
      }

      index += 1;
      continue;
    }

    if (arg.startsWith('--hostname=')) {
      hostname = arg.slice('--hostname='.length);
      forwardedArgs.push(arg);
      continue;
    }

    forwardedArgs.push(arg);
  }

  return { forwardedArgs, hostname, requestedPort };
}

function canListen(port, hostname) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }

      reject(error);
    });

    server.once('listening', () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(true);
      });
    });

    const listenOptions = hostname ? { host: hostname, port } : { port };
    server.listen(listenOptions);
  });
}

async function findAvailablePort(startPort, hostname) {
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt += 1) {
    const port = startPort + attempt;
    const available = await canListen(port, hostname);

    if (available) {
      return port;
    }
  }

  throw new Error(
    `Could not find a free port in range ${startPort}-${startPort + MAX_PORT_ATTEMPTS - 1}.`,
  );
}

function copyDirectory(source, destination, { replace = false } = {}) {
  if (!fs.existsSync(source)) {
    return;
  }

  if (replace) {
    fs.rmSync(destination, { force: true, recursive: true });
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { force: true, recursive: true });
}

function ensureStandaloneAssets() {
  const root = process.cwd();
  const standaloneRoot = path.join(root, '.next', 'standalone');

  copyDirectory(
    path.join(root, '.next', 'static'),
    path.join(standaloneRoot, '.next', 'static'),
    { replace: true },
  );
  copyDirectory(path.join(root, 'public'), path.join(standaloneRoot, 'public'));
}

async function main() {
  const { forwardedArgs, hostname, requestedPort } = parseArgs(process.argv.slice(2));
  const selectedPort = await findAvailablePort(requestedPort, hostname);

  if (selectedPort !== requestedPort) {
    console.warn(
      `Port ${requestedPort} is busy, starting Next.js on port ${selectedPort} instead.`,
    );
  }

  const standaloneServer = path.join(process.cwd(), '.next', 'standalone', 'server.js');
  const env = {
    ...process.env,
    PORT: String(selectedPort),
  };

  if (hostname) {
    env.HOSTNAME = hostname;
  }

  if (fs.existsSync(standaloneServer)) {
    ensureStandaloneAssets();
  }

  const child = fs.existsSync(standaloneServer)
    ? spawn(process.execPath, [standaloneServer, ...forwardedArgs], {
        env,
        stdio: 'inherit',
      })
    : spawn(
        process.execPath,
        [
          path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next'),
          'start',
          '--port',
          String(selectedPort),
          ...forwardedArgs,
        ],
        {
          env,
          stdio: 'inherit',
        },
      );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
