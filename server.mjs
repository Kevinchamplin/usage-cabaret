import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

import { claudeWindows, readingPath } from './claude-storage.mjs';

const port = Number(process.env.CABARET_PORT ?? 4876);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('CABARET_PORT must be an integer between 1 and 65535.');
}
const address = `127.0.0.1:${port}`;
const root = new URL('./public/', import.meta.url);
const exec = promisify(execFile);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const types = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

function windowReading(used, resets, mins, observedAt, source) {
  if (!Number.isFinite(used) || used < 0 || !Number.isFinite(mins) || mins <= 0) return null;
  return {
    used,
    resetsAt: Number.isFinite(resets) && resets > 0 ? resets * 1000 : null,
    minutes: mins,
    observedAt,
    source,
  };
}

async function readClaude() {
  const windows = await Promise.all(Object.entries(claudeWindows).map(async ([key, mins]) => {
    const raw = await readFile(readingPath(key), 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return '';
    });
    const row = parse(raw);
    if (!row || !Number.isFinite(row.observedAt)) return null;
    return windowReading(row.used, row.resetsAt, mins, row.observedAt, 'Claude Code');
  }));
  return { windows: windows.filter(Boolean), issue: null };
}

function readCodex() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CABARET_CODEX || 'codex', ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let finished = false;
    const lines = createInterface({ input: child.stdout });
    const timer = setTimeout(() => finish('Codex took too long to respond.'), 8000);
    function finish(issue, windows) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.destroy();
      child.kill();
      if (issue) reject(new Error(issue)); else resolve({ windows, issue: null });
    }
    const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
    child.on('error', () => finish('Could not start the Codex CLI.'));
    child.on('exit', () => finish('Codex closed before reporting usage.'));
    child.stdin.on('error', () => finish('Could not connect to Codex.'));
    lines.on('line', line => {
      const response = parse(line);
      if (response?.id === 1) {
        if (response.error) return finish('Could not connect to Codex.');
        send({ method: 'initialized' });
        send({ id: 2, method: 'account/rateLimits/read' });
      }
      if (response?.id === 2) {
        const rate = response.result?.rateLimitsByLimitId?.codex ?? response.result?.rateLimits;
        if (!rate) return finish('Codex did not report account limits.');
        const now = Date.now();
        const windows = [rate.primary, rate.secondary].filter(Boolean).map(w =>
          windowReading(w.usedPercent, w.resetsAt, w.windowDurationMins, now, 'Codex account')
        ).filter(Boolean);
        finish(windows.length ? null : 'Codex did not report any quota windows.', windows);
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: {
      name: 'usage_cabaret', title: 'Usage Cabaret', version: '1.0.0',
    } } });
  });
}

function cache(reader, ttl, fallback) {
  let last = { windows: [], issue: null }, pending, checkedAt = 0;
  return async () => {
    if (pending) return pending;
    if (Date.now() - checkedAt < ttl) return last;
    pending = reader().then(result => { last = result; })
      .catch(error => { last = { ...last, issue: fallback ?? error.message }; })
      .then(() => last).finally(() => { checkedAt = Date.now(); pending = null; });
    return pending;
  };
}

const getClaude = cache(readClaude, 10_000, 'Could not read the Claude Code status line data.');
const getCodex = cache(readCodex, 60_000);
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (![address, `localhost:${port}`].includes(req.headers.host) ||
      req.headers['sec-fetch-site'] === 'cross-site' || req.method !== 'GET') {
    res.writeHead(403).end();
    return;
  }
  try {
    if (req.url === '/api/usage') {
      const [claude, codex] = await Promise.all([getClaude(), getCodex()]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({ claude, codex, checkedAt: Date.now() }));
    } else if (Object.hasOwn(types, req.url)) {
      const [file, mime] = types[req.url];
      const body = file === 'index.html'
        ? (await readFile(new URL(file, root), 'utf8')).replace('<!-- STAGE_ART -->',
          await readFile(new URL('stage.svg', root), 'utf8'))
        : await readFile(new URL(file, root));
      res.writeHead(200, { 'Content-Type': mime }).end(body);
    } else res.writeHead(404).end('Not found');
  } catch {
    res.writeHead(500).end('Could not load the dashboard');
  }
});
server.on('error', error => {
  if (error.code !== 'EADDRINUSE') throw error;
  console.error(`Port ${port} is already in use.`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Usage Cabaret: http://${address}`);
  if (process.platform === 'darwin' && process.argv.includes('--open')) {
    exec('/usr/bin/open', [`http://${address}`]).catch(() => {});
  }
});
