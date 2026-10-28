'use strict';

const http = require('node:http');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { URL } = require('node:url');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const delayHistogram = monitorEventLoopDelay({ resolution: 20 });
delayHistogram.enable();

let previousCpu = process.cpuUsage();
let previousTime = performance.now();
let previousElu = performance.eventLoopUtilization();

function diagnostics() {
  const now = performance.now();
  const cpuDelta = process.cpuUsage(previousCpu);
  const elapsedMs = now - previousTime;
  const elu = performance.eventLoopUtilization(previousElu);
  previousCpu = process.cpuUsage();
  previousTime = now;
  previousElu = performance.eventLoopUtilization();

  const memory = process.memoryUsage();
  return {
    uptimeSeconds: process.uptime(),
    memoryBytes: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external
    },
    cpu: {
      userMicroseconds: cpuDelta.user,
      systemMicroseconds: cpuDelta.system,
      intervalMilliseconds: Number(elapsedMs.toFixed(2))
    },
    eventLoop: {
      utilization: Number(elu.utilization.toFixed(4)),
      delayMeanMs: Number((delayHistogram.mean / 1e6 || 0).toFixed(3)),
      delayP95Ms: Number((delayHistogram.percentile(95) / 1e6 || 0).toFixed(3)),
      delayMaxMs: Number((delayHistogram.max / 1e6 || 0).toFixed(3))
    }
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  if (url.pathname === '/diagnostics') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(diagnostics()));
  }

  if (url.pathname === '/work') {
    const iterations = Math.min(Math.max(Number(url.searchParams.get('n') || 100000), 1), 2000000);
    let value = 0;
    for (let i = 0; i < iterations; i++) value = (value + Math.sqrt(i)) % 1000003;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ iterations, value }));
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`Sample server listening at http://${HOST}:${PORT}`);
});

function shutdown() {
  delayHistogram.disable();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
