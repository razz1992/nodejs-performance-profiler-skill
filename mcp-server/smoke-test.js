'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const token = 'temporary-smoke-test-token-not-for-use-outside-this-test';
const port = 18787;
const endpoint = `http://127.0.0.1:${port}/mcp`;
const serverPath = path.join(__dirname, 'server.js');

async function post(body, authToken = token) {
  const headers = { 'content-type': 'application/json' };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  return fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function main() {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PROFILER_MCP_TOKEN: token, PROFILER_MCP_PORT: String(port) },
    stdio: 'ignore',
    windowsHide: true
  });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) throw new Error('MCP server exited during startup');
      try {
        const response = await post({ jsonrpc: '2.0', id: 0, method: 'ping' }, 'wrong-token');
        if (response.status === 401) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, 'server should start and reject invalid tokens');

    const initialized = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke-test', version: '1' } }
    });
    assert.equal(initialized.status, 200);
    const initBody = await initialized.json();
    assert.equal(initBody.result.serverInfo.name, 'nodejs-performance-profiler');

    const listed = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listBody = await listed.json();
    const names = listBody.result.tools.map(tool => tool.name);
    assert.deepEqual(names, ['read_skill', 'inspect_environment', 'run_tests', 'run_profile', 'run_threadpool_check']);

    const skill = await post({
      jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_skill', arguments: {} }
    });
    const skillBody = await skill.json();
    assert.equal(skillBody.result.isError, false);
    assert.match(skillBody.result.content[0].text, /Node.js Performance Profiling Skill/);

    const tests = await post({
      jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'run_tests', arguments: {} }
    });
    const testText = (await tests.json()).result.content[0].text;
    assert.match(testText, /pass 1/i);

    const profile = await post({
      jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'run_profile', arguments: {} }
    });
    const profileText = (await profile.json()).result.content[0].text;
    assert.match(profileText, /"requests": 30/);

    const threadpool = await post({
      jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'run_threadpool_check', arguments: {} }
    });
    assert.equal((await threadpool.json()).result.isError, false);

    console.log('MCP smoke test passed: auth, initialization, tool discovery, read, tests, profile, thread-pool check.');
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

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
