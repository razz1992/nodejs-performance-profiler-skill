'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

function waitForServer(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error('Server exited before it became ready'));
        return;
      }
      const req = http.get('http://127.0.0.1:3000/health', res => {
        res.resume();
        if (res.statusCode === 200) {
          clearInterval(timer);
          resolve();
        }
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Timed out waiting for server'));
        }
      });
    }, 100);
  });
}

test('sample server exposes health, work and diagnostics endpoints', async t => {
  const child = spawn(process.execPath, ['src/server.js'], {
    stdio: 'ignore',
    env: { ...process.env, PORT: '3000' }
  });
  t.after(() => {
    if (child.exitCode === null) child.kill();
  });

  await waitForServer(child);

  const health = await fetch('http://127.0.0.1:3000/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const work = await fetch('http://127.0.0.1:3000/work?n=1000');
  assert.equal(work.status, 200);
  assert.equal((await work.json()).iterations, 1000);

  const diagnostics = await fetch('http://127.0.0.1:3000/diagnostics');
  assert.equal(diagnostics.status, 200);
  const body = await diagnostics.json();
  assert.ok(body.memoryBytes.rss > 0);
  assert.ok(body.eventLoop.utilization >= 0);
});
