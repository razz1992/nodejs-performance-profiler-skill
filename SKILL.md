---
name: nodejs-performance-profiler
description: Profile a local Node.js sample application for memory, CPU, event-loop delay, thread-pool symptoms, and test results. Use when asked to diagnose Node.js performance. Run only approved diagnostic/test commands; never edit application source code.
---

# Node.js Performance Profiling Skill

## Purpose
Run a repeatable, read-only performance investigation of the included sample Node.js HTTP application. Collect evidence and report findings without modifying application source files.

## Safety rules
- Work only inside this skill project directory unless the user explicitly approves another target.
- Do not edit `src/` files or package configuration while profiling.
- Do not install packages or access the network unless the user explicitly approves it. This sample uses Node.js built-ins only.
- Run the automated tests before performance experiments.
- Start the sample server only on `127.0.0.1`, using the documented port.
- Do not run high-volume or unbounded load. Use the bounded requests in the scripts.
- Stop any server process started by the workflow when finished.
- Treat measurements as observations, not proof of a root cause. Explain limitations.

## Workflow
1. Confirm the current working directory is this project and inspect `node --version`.
2. Run `node --test test/*.test.js`. If tests fail, report the failures and do not claim the application passed.
3. Start the server with `node src/server.js` in a managed terminal/session. It listens on `127.0.0.1:3000`.
4. In another terminal, run `node scripts/profile.js`. This makes a bounded set of local HTTP requests and records response timings and the server's `/diagnostics` output.
5. Run `node scripts/threadpool-check.js` to compare a small, bounded set of asynchronous crypto jobs. Do not interpret this alone as proof of libuv thread-pool saturation.
6. Stop the server process started in step 3.
7. Review the output. Distinguish observed facts, hypotheses, and recommended next tests.

## Metrics and interpretation
- Memory: `rss`, `heapUsed`, `heapTotal`, and `external` from `process.memoryUsage()`. A single sample cannot establish a memory leak.
- CPU: `process.cpuUsage()` deltas are process CPU time for the interval, not a machine-wide CPU percentage. Compare repeated samples under a known workload.
- Event loop: `monitorEventLoopDelay()` provides delay distribution in nanoseconds; convert to milliseconds. Event-loop utilization is a ratio over the measured interval, not the same as OS CPU utilization.
- Thread pool: asynchronous `crypto.pbkdf2` completion times can indicate contention under a controlled workload. They do not expose queue depth and do not prove a thread-pool issue by themselves.
- Latency: report sample count, average, and p95 where calculated. Small samples are directional only.

## Expected output
Produce a concise report with:
- Environment and commands executed
- Test pass/fail summary
- Request count and latency summary
- Memory, CPU-time, event-loop delay and utilization observations
- Thread-pool experiment results and limitations
- Findings separated into observed evidence, hypotheses, and recommended follow-up
- Confirmation that source files were not changed

## Failure handling
If a command fails, capture the error and stop dependent steps. Do not silently retry destructive or long-running commands. Ask the user before changing files, installing dependencies, binding to a non-loopback interface, or increasing workload.
