'use strict';

const { performance } = require('node:perf_hooks');

const BASE = 'http://127.0.0.1:3000';
const REQUESTS = 30;

async function main() {
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) throw new Error(`Server health check failed: HTTP ${health.status}`);

  const samples = [];
  for (let i = 0; i < REQUESTS; i++) {
    const start = performance.now();
    const response = await fetch(`${BASE}/work?n=250000`);
    if (!response.ok) throw new Error(`Work request failed: HTTP ${response.status}`);
    await response.arrayBuffer();
    samples.push(performance.now() - start);
  }

  const diagnosticsResponse = await fetch(`${BASE}/diagnostics`);
  const diagnostics = await diagnosticsResponse.json();
  samples.sort((a, b) => a - b);
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];

  console.log(JSON.stringify({
    target: BASE,
    requests: samples.length,
    latencyMs: {
      average: Number(average.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      min: Number(samples[0].toFixed(2)),
      max: Number(samples[samples.length - 1].toFixed(2))
    },
    serverDiagnostics: diagnostics,
    caveats: [
      'Small local sample; results are directional, not a production benchmark.',
      'CPU values are process CPU time deltas, not system-wide CPU percent.',
      'Event-loop delay is measured by the server process and can vary with sampling interval.'
    ]
  }, null, 2));
}

main().catch(error => {
  console.error(`Profiling failed: ${error.message}`);
  console.error('Make sure the sample server is running at http://127.0.0.1:3000.');
  process.exitCode = 1;
});
