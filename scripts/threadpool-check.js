'use strict';

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const JOBS = 4;
const ITERATIONS = 100000;
const KEYLEN = 32;

function runJob(id) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    crypto.pbkdf2('learning-only', `salt-${id}`, ITERATIONS, KEYLEN, 'sha256', (error) => {
      if (error) return reject(error);
      resolve({ job: id, durationMs: Number((performance.now() - start).toFixed(2)) });
    });
  });
}

async function main() {
  console.log(`Running ${JOBS} bounded asynchronous crypto jobs; iterations=${ITERATIONS}.`);
  const results = await Promise.all(Array.from({ length: JOBS }, (_, i) => runJob(i + 1)));
  console.log(JSON.stringify({
    jobs: results,
    note: 'Completion times are a rough experiment only. They do not reveal libuv queue depth or prove thread-pool saturation.'
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
