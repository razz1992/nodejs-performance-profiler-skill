'use strict';

// Minimal, dependency-free MCP Streamable HTTP endpoint for the fixed profiling project.
// Security: loopback-only listener, bearer token required, fixed commands and fixed cwd.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const PROJECT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PROFILER_MCP_PORT || 8787);
const TOKEN = process.env.PROFILER_MCP_TOKEN;
// Opt-in for a tunnel-client on the same host. The server still binds only to loopback.
// Bearer-token authentication remains the default unless this flag is explicitly true.
const ALLOW_LOCAL_NO_AUTH = process.env.PROFILER_MCP_ALLOW_LOCAL_NO_AUTH === 'true';
const PROTOCOL_VERSION = '2025-03-26';

if (!ALLOW_LOCAL_NO_AUTH && (!TOKEN || TOKEN.length < 32)) {
  console.error('Set PROFILER_MCP_TOKEN to a random secret of at least 32 characters, or explicitly enable PROFILER_MCP_ALLOW_LOCAL_NO_AUTH=true for a loopback-only tunnel.');
  process.exit(1);
}

const toolDefinitions = [
  {
    name: 'read_skill',
    description: 'Read the project SKILL.md instructions. Does not modify files.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'inspect_environment',
    description: 'Inspect Node version, project package scripts, and required file presence.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'run_tests',
    description: 'Run the fixed Node built-in test file. No install or source edits.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'run_profile',
    description: 'Start the sample server on loopback, run the bounded profile script, then stop the server.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'run_threadpool_check',
    description: 'Run the fixed bounded asynchronous crypto experiment. Results are diagnostic only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }
];

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text: String(text) }], isError };
}

function runFixedCommand(args, timeout = 30000) {
  try {
    return execFileSync(process.execPath, args, {
      cwd: PROJECT,
      encoding: 'utf8',
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
  } catch (error) {
    const details = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
    throw new Error(details || 'Approved command failed');
  }
}

async function waitForHealth(child, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Sample server exited before becoming ready.');
    try {
      const response = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for sample server health endpoint.');
}

async function runProfile() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: PROJECT,
    env: { ...process.env, PORT: '3000' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let serverOutput = '';
  child.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  child.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
  try {
    await waitForHealth(child);
    const output = runFixedCommand(['scripts/profile.js'], 30000);
    return output + (serverOutput ? '\nServer log:\n' + serverOutput : '');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    }
  }
}

async function callTool(name) {
  switch (name) {
    case 'read_skill':
      return fs.readFileSync(path.join(PROJECT, 'SKILL.md'), 'utf8');
    case 'inspect_environment': {
      const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT, 'package.json'), 'utf8'));
      const required = ['SKILL.md', 'package.json', 'src/server.js', 'scripts/profile.js',
        'scripts/threadpool-check.js', 'test/server.test.js'];
      return JSON.stringify({
        projectDirectory: PROJECT,
        nodeVersion: process.version,
        platform: process.platform,
        packageName: pkg.name,
        scripts: pkg.scripts,
        requiredFiles: Object.fromEntries(required.map(file =>
          [file, fs.existsSync(path.join(PROJECT, file))])),
        dependencyPolicy: 'No package installation; built-in Node.js APIs only.'
      }, null, 2);
    }
    case 'run_tests':
      return runFixedCommand(['--test', 'test/server.test.js'], 30000);
    case 'run_profile':
      return await runProfile();
    case 'run_threadpool_check':
      return runFixedCommand(['scripts/threadpool-check.js'], 30000);
    default:
      throw new Error('Unknown tool. Only the published fixed tool list is allowed.');
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/mcp') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const authorization = req.headers.authorization || '';
  if (!ALLOW_LOCAL_NO_AUTH && authorization !== 'Bearer ' + TOKEN) {
    res.writeHead(401, { 'www-authenticate': 'Bearer', 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Unauthorized');
  }

  let raw = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 1024 * 1024) req.destroy(new Error('Request body too large'));
  });
  req.on('end', async () => {
    let message;
    try { message = JSON.parse(raw); }
    catch { return sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }

    if (message.method === 'notifications/initialized' || message.method?.startsWith('notifications/')) {
      res.writeHead(202);
      return res.end();
    }

    const id = message.id ?? null;
    try {
      let result;
      if (message.method === 'initialize') {
        result = {
          protocolVersion: message.params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'nodejs-performance-profiler', version: '1.0.0' }
        };
      } else if (message.method === 'ping') {
        result = {};
      } else if (message.method === 'tools/list') {
        result = { tools: toolDefinitions };
      } else if (message.method === 'tools/call') {
        const name = message.params?.name;
        if (!toolDefinitions.some(tool => tool.name === name)) throw new Error('Tool is not allowed.');
        result = textResult(await callTool(name));
      } else {
        return sendJson(res, 200, {
          jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' }
        });
      }
      return sendJson(res, 200, { jsonrpc: '2.0', id, result });
    } catch (error) {
      return sendJson(res, 200, {
        jsonrpc: '2.0', id,
        result: textResult(error.message || 'Tool failed', true)
      });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Profiling MCP server listening on http://${HOST}:${PORT}/mcp`);
  console.log('Only fixed read/test/profile tools are exposed.');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
