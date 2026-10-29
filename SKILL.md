---
name: nodejs-performance-profiler
description: Investigate CPU, memory, event-loop delay, request latency, and libuv thread-pool behavior in a local Node.js application. Record evidence-backed bugs and enhancements in a numbered review backlog for weekly or biweekly human approval; never implement unapproved changes.
---

# Node.js Performance Profiling and Investigation Skill

## Purpose

Run a repeatable, bounded, read-only performance investigation of the included sample Node.js HTTP application. Investigate **CPU, memory, event-loop delay/utilization, request latency, and libuv thread-pool behavior**. Record each evidence-backed bug or enhancement in a numbered Markdown backlog, including current-system impact and an estimated improvement. Findings are proposals only: a human reviews backlog items weekly or biweekly and approves individual IDs before implementation.

## Investigation scope

Investigate:
1. CPU time, CPU-bound request behavior, and possible synchronous blocking.
2. Memory usage, allocation patterns, and evidence of possible growth.
3. Event-loop utilization, delay, and request latency under idle and controlled workloads.
4. libuv thread-pool utilization/queueing symptoms and relevant asynchronous workloads, including the existing `scripts/threadpool-check.js` if present and safe after inspection.
5. Interactions between these areas, distinguishing event-loop blocking from thread-pool queueing and from external/system bottlenecks.

Do not assume a single metric proves a root cause. Thread-pool workload experiments must be bounded, local, and reviewed for their behavior before execution. Do not add dependencies or use network resources without explicit approval.

## Safety and change-control rules

- Work only inside this project directory unless the user explicitly approves another target.
- During investigation and initial triage, do not edit application source, tests, or `package.json`.
- Do not install packages or access the network unless explicitly approved. Prefer Node.js built-ins and existing scripts.
- Run automated tests before performance experiments. If tests fail, record the exact failure and stop dependent experiments.
- Start the sample server only on `127.0.0.1:3000`.
- Keep workloads bounded; inspect scripts and their maximum workload before running them. Do not increase workload simply to obtain a dramatic result.
- Check whether port 3000 already has a listener before starting the server. Identify the process and command line before stopping anything; never terminate an unrelated process.
- Stop only server processes started by this workflow and verify that the port is no longer listening afterward.
- Never present a hypothesis as a confirmed defect or an estimate as a measured result.
- Reports, backlogs, and experiment helpers must remain outside `src/`, tests, and package configuration. Do not overwrite existing reports; use a distinct descriptive filename.
- **Investigation does not authorize implementation.** Do not change source, tests, configuration, dependencies, or runtime behavior until the specific backlog ID has explicit human approval.

## Review cadence and approval model

- Maintain one numbered backlog at `PERFORMANCE-INVESTIGATION-BACKLOG.md` in the project root.
- Every bug or enhancement gets a stable unique ID (for example, `PERF-001`) and its own row. Keep detailed evidence and test plans in a linked standalone report where needed.
- Backlog columns must include: **ID, Type, Area, Finding, Evidence, Current-system impact, Proposed change, Estimated improvement, Effort/risk, Status, Test/verification plan, and Review date/cycle**.
- Number IDs sequentially; never reuse an ID. Keep findings in the backlog even if they are deferred or rejected, with the review decision recorded.
- The human review happens weekly or biweekly. At each review, the human approves, defers, rejects, or requests more evidence for each individual ID. Only explicitly approved IDs may proceed. Approval of one item does not approve related or adjacent items.
- Before implementation, confirm the exact approved ID and scope. If approval is unclear, ask before editing.
- Items not approved remain untouched: no code changes, test changes, config changes, dependency additions, or opportunistic cleanup.
- Estimated improvement must state its basis and uncertainty (for example, hypothesis pending benchmark); do not invent percentages or promise gains. Prefer measurable targets and a validation method.
- Update status and review date after each review. Use statuses such as `Needs evidence`, `Ready for review`, `Approved`, `Deferred`, `Rejected`, `In progress`, `Verified`, and `Blocked`.
- An item is not `Verified` or `Resolved` until its approved change and required tests/measurements have passed.

## Required bug-to-fix workflow

1. **Investigate and document:** Gather bounded evidence. Do not change application source or tests.
2. **Create/update backlog:** Assign the next unique ID and add a complete table row with current-system impact and estimated improvement. Link a standalone report for detailed evidence.
3. **Define verification:** Specify regression tests, performance measurements, acceptance criteria, and limitations. Distinguish pre-fix observations from post-fix targets.
4. **Prepare for review:** A coding agent may inspect implementation and propose a patch/test plan, but must not implement or modify source/tests without approval of the specific ID.
5. **Weekly/biweekly human review:** Record the decision per ID. Wait if an item is deferred, rejected, or still needs evidence.
6. **Implement only approved scope:** Re-inspect current code and tests; make the smallest safe change for the approved ID only. Do not bundle unapproved findings.
7. **Verify:** Run targeted regression tests, then the full suite (`node --test test/*.test.js`), and repeat comparable bounded measurements. Record exact commands, results, and environment.
8. **Update records:** Update the detailed report and backlog with diff summary, tests, before/after results, limitations, decision, and status. Keep the item open/blocked if required checks fail.

## Workflow

1. Confirm the working directory, Node.js version, required files, and project scripts.
2. Inspect `src/server.js`, `scripts/profile.js`, `scripts/threadpool-check.js` if present, and relevant tests before interpreting metrics or running a workload.
3. Run `node --test test/*.test.js`. If tests fail, record the exact failure and stop dependent experiments.
4. Check port 3000 for an existing listener. Resolve conflicts safely before starting the server.
5. Start `node src/server.js` on loopback in a managed process.
6. Capture baseline `/diagnostics` samples after a short idle period.
7. Run the bounded profile script (`node scripts/profile.js`) and record request latency, workload parameters, and diagnostics.
8. Run a small controlled event-loop experiment using a bounded burst against `/work?n=2000000` only after confirming that this remains within the application's existing workload cap. Record request count, concurrency, duration, per-request latency, and before/after diagnostics.
9. Investigate memory using multiple samples at comparable points (idle and after the same bounded workload). Record RSS, heapUsed, heapTotal, and external memory.
10. Investigate thread-pool behavior only after inspecting the relevant code/script. Use a bounded local workload; record the operation, concurrency, duration, throughput, latency distribution, and any available queueing/worker-pool evidence. Compare with a low-concurrency baseline. If direct queue depth or pool saturation is not observable, say so; treat inferred saturation as a hypothesis. Do not claim thread-pool saturation from latency alone.
11. Interpret metrics and check whether they refer to comparable measurement windows.
12. Stop only the server process started by this workflow and verify no listener remains on port 3000.
13. For every supported bug or enhancement, add a numbered backlog entry and, when useful, a detailed standalone report. If evidence is inconclusive, mark it `Needs evidence` and state the next experiment instead of asserting a defect.

## Metrics and interpretation

### CPU
- `process.cpuUsage()` returns process CPU time in microseconds; deltas are not machine-wide CPU percentages.
- Approximate process-level CPU ratio, when useful: `(userDeltaUs + systemDeltaUs) / (elapsedMs * 1000) * 100`. Label it accurately.
- Correlate CPU deltas with latency and event-loop measurements. Synchronous CPU-bound work can block JavaScript callbacks.

### Memory
- Record `rss`, `heapUsed`, `heapTotal`, and `external` from `process.memoryUsage()`.
- Compare repeated samples after similar workloads and settling periods. GC timing affects heap measurements; RSS may remain elevated after collection.
- A single sample or short upward trend does not establish a leak.

### Event loop
- `monitorEventLoopDelay()` histogram values are in nanoseconds; divide by `1e6` for milliseconds.
- Report mean, p95, and maximum delay when available, plus event-loop utilization (ELU) and request latency.
- ELU measures event-loop activity over its interval, not operating-system CPU utilization.
- A synchronous task can prevent other JavaScript callbacks and requests from running until it yields or completes.
- Check histogram lifecycle and measurement windows. If the histogram is cumulative while CPU/ELU are interval deltas, label the distinction; do not compare them as though they cover the same interval.
- A high maximum with normal mean/p95 may be an outlier. Validate with controlled observations.

### Thread pool
- Node.js uses libuv's worker pool for certain asynchronous operations; not every asynchronous API uses it. Inspect the actual APIs used by the application and workload.
- Distinguish worker-pool queueing from event-loop blocking, CPU saturation, filesystem/network delays, and downstream service latency.
- Record workload type, configured concurrency, duration, throughput, latency distribution, and comparison baseline. Note relevant environment settings such as `UV_THREADPOOL_SIZE` if known; do not change them silently.
- A thread-pool size change is a separate proposed change requiring its own backlog ID/approval and before/after validation.
- If direct pool queue depth or saturation metrics are unavailable, clearly label the diagnosis as an inference and specify what evidence would strengthen it.

### Latency
- Record request/operation count, concurrency, workload parameters, average, p95, minimum, and maximum where calculated.
- Small local samples are directional, not production benchmarks. Compare like-for-like conditions.

## Backlog and detailed report requirements

The root backlog `PERFORMANCE-INVESTIGATION-BACKLOG.md` is the review source of truth. Each item should have:
- A unique sequential ID and type (`Bug` or `Enhancement`).
- Area (CPU, memory, event loop, thread pool, latency, observability, or cross-cutting).
- Concise finding and evidence with units, workload, and measurement window.
- **Current-system impact:** who/what is affected, observable symptom, severity, and confidence.
- **Proposed change:** narrowly scoped, not yet implemented.
- **Estimated improvement:** a cautious range or qualitative estimate with assumptions and how it will be measured. If unsupported, write `Unknown — baseline/experiment required`.
- Effort/risk, status, verification plan, and review date/cycle.
- A link/path to a detailed report where evidence or test planning needs more room.

A detailed report should include summary, status, classification, confidence, file paths/functions, reproduction steps, actual observations, expected versus actual behavior, alternatives/limitations, regression/performance test plan, acceptance criteria, approval gate, and post-change verification requirements. Use `Needs manual review — do not auto-fix` before approval. Never invent metrics, line numbers, test names, root causes, or test results.

## Expected investigation summary

Report environment and commands, test results, CPU and memory observations, event-loop delay/ELU/latency, thread-pool workload and evidence, measurement-window caveats, findings separated into facts/hypotheses/conclusions, backlog IDs and report paths, whether any files beyond documentation changed, and cleanup/port status.

## Failure handling

Capture exact errors and stop dependent steps. Do not silently retry destructive or long-running commands. Ask before editing source/tests, installing dependencies, binding beyond loopback, changing environment settings such as `UV_THREADPOOL_SIZE`, or increasing workload.

---
