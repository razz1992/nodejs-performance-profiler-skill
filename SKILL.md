---
name: nodejs-performance-profiler
description: Diagnose CPU usage, memory usage, and event-loop delay in a local Node.js application, then document evidence-backed bugs and a regression-test plan for human review by a coding agent. Do not investigate thread-pool issues or automatically fix application code.
---

# Node.js Performance Profiling and Bug-Triage Skill

## Purpose
Run a repeatable, bounded, read-only performance investigation of the included sample Node.js HTTP application. Gather evidence about **CPU usage, memory usage, and event-loop delay**. When evidence supports a likely defect, create a standalone bug report with explicit regression-test requirements. A human must approve implementation before application source or test files are changed.

## Scope
Investigate only:
1. CPU time and CPU-bound request behavior.
2. Memory usage and whether repeated measurements suggest growth.
3. Event-loop utilization, event-loop delay, and request latency under idle and controlled CPU load.

**Explicitly out of scope:** libuv thread-pool diagnosis, `crypto.pbkdf2` experiments, thread-pool saturation hypotheses, and `scripts/threadpool-check.js`. Do not run or report a thread-pool experiment unless the user separately changes this skill's scope.

## Safety and change-control rules
- Work only inside this project directory unless the user explicitly approves another target.
- During profiling and initial bug triage, do not edit application source, tests, or `package.json`.
- Do not install packages or access the network unless the user explicitly approves it. Prefer Node.js built-ins.
- Run automated tests before performance experiments. If tests fail, record the exact failure and stop dependent experiments.
- Start the sample server only on `127.0.0.1:3000`.
- Keep workload bounded. Use existing scripts and a small, documented number of controlled requests.
- Check whether port 3000 already has a listener before starting the server. Identify the process and command line before stopping anything; never terminate an unrelated process.
- Stop only server processes started by this workflow and verify that the port is no longer listening afterward.
- Never claim that a single metric or run proves a root cause. Separate observations, hypotheses, and confirmed defects.
- A bug report is documentation, not a source-code fix. Never silently patch application code or tests after identifying an issue.
- Keep reports and experiment helpers outside `src/`, tests, and package configuration. Do not overwrite an existing report; use a distinct descriptive filename.

## Required bug-to-fix workflow
Follow this sequence for every evidence-backed issue. Do not skip or reorder the approval gate.

1. **Detect and document:** Record the evidence and create a standalone Markdown bug report. Do not change application source or tests during profiling.
2. **Define regression coverage:** The report must specify test cases that fail or expose the defect before the fix and pass after the fix. Include the intended assertions, relevant test file(s), and any test limitations. If a reliable automated regression test is not feasible, explain why and specify the repeatable manual verification instead.
3. **Prepare for human review:** A coding agent may inspect the current implementation and propose a test-only change or a patch plan for review, but it must not implement the application fix or modify test files before explicit human approval. Do not present a test as passing unless it was actually run.
4. **Human approval:** Wait for an explicit approval of the proposed implementation. The bug report alone is not authorization.
5. **Implement and test:** After approval, inspect the current source and tests again. Implement the smallest safe fix and add or update the regression tests described in the report. Keep tests focused on the defect and preserve existing behavior.
6. **Verify:** Run the targeted regression test(s), then the full suite (`node --test test/*.test.js`). Report the exact commands and results. The issue is not resolved if a relevant test or the full suite fails; investigate and report the failure rather than weakening or deleting a valid test merely to get a green result.
7. **Close with evidence:** Update the bug report with the implemented change, test names, commands, pass/fail output, and any remaining limitations. Mark it resolved only after required tests pass. Include the diff summary and confirm that no out-of-scope thread-pool work was performed.

## Workflow
1. Confirm the working directory, Node.js version, required files, and project scripts.
2. Inspect the current implementation of `src/server.js`, `scripts/profile.js`, and relevant tests before interpreting metrics.
3. Run `node --test test/*.test.js`. If tests fail, report the exact failure and stop dependent performance experiments.
4. Check port 3000 for an existing listener. Resolve conflicts safely before starting the server.
5. Start `node src/server.js` on loopback in a managed process.
6. Capture a baseline `/diagnostics` sample after a short idle period.
7. Run the bounded profile script (`node scripts/profile.js`) to measure request latency and diagnostics under its known `/work` workload.
8. Perform a small controlled event-loop experiment: compare an idle observation with a bounded burst of requests to `/work?n=2000000`. Record request count, concurrency, duration, per-request latency, and before/after diagnostics. Do not increase the workload just to obtain a dramatic result.
9. For memory learning, collect multiple samples at comparable points (idle and after the same bounded workload). Report RSS, heapUsed, heapTotal, and external memory. Do not call growth a leak unless repeated controlled observations support that hypothesis and alternatives are considered.
10. Interpret metrics using the definitions below. Check whether reported metrics refer to the same measurement window.
11. Stop the server process started by this workflow and verify no listener remains on port 3000.
12. If a likely defect is supported by evidence, create a standalone bug report using the required format below. Otherwise, create no bug report and explain what evidence is still needed.

## Metrics and interpretation

### CPU
- `process.cpuUsage()` returns process CPU time in microseconds. Deltas are not machine-wide CPU percentages.
- Record the measurement interval and workload. If useful, calculate approximate process CPU percentage as `(userDeltaUs + systemDeltaUs) / (elapsedMs * 1000) * 100`; label it as an approximate process-level ratio and do not treat it as whole-machine CPU usage.
- A CPU-bound synchronous handler can block the event loop. Correlate CPU-time deltas with request latency and event-loop measurements rather than interpreting them alone.

### Memory
- Record `rss`, `heapUsed`, `heapTotal`, and `external` from `process.memoryUsage()`.
- Compare repeated samples after similar workload and settling periods. Heap growth may reflect allocation and garbage-collection timing; RSS can remain elevated after objects are collected.
- A single sample or short upward trend does not establish a memory leak. Document a leak as a hypothesis unless a repeatable growth pattern and supporting evidence exist.

### Event loop
- `monitorEventLoopDelay()` reports histogram values in nanoseconds; divide by `1e6` to report milliseconds.
- Report mean, p95, and maximum delay when available, plus event-loop utilization (ELU) and request latency.
- ELU is event-loop activity over its measurement interval, not operating-system CPU utilization.
- A synchronous CPU-bound task prevents other JavaScript callbacks and requests from being processed until it yields or completes.
- Inspect histogram lifecycle carefully. If a histogram is enabled once at process startup and never reset, its delay statistics summarize an accumulated sampling window, while CPU/ELU deltas may cover only the interval since the previous diagnostics request. These values are not directly window-aligned.
- A high maximum delay with normal mean/p95 may represent a short outlier; validate it with a controlled reproduction and fresh measurement window. Never turn a surprising maximum directly into a claim about a real stall without corroboration.

### Latency
- Report request count, concurrency, workload parameters, average, p95, minimum, and maximum where calculated.
- Small local samples are directional, not production benchmarks.

## Bug report requirements
When a likely defect is identified, write a separate Markdown report outside `src/` and tests. Prefer `bug-reports/BUG-<short-topic>.md`; create the directory if needed. If a path already contains user work, do not overwrite it; choose a new filename.

Every report must be understandable to a coding agent that has not seen this chat and include:
1. Title and status: `Needs manual review — do not auto-fix`.
2. Plain-language summary, classification, confidence, and scope.
3. Relevant file paths and functions/lines if known.
4. Preconditions and exact bounded reproduction steps/commands.
5. Observed results with units and baseline comparison.
6. Expected versus actual behavior.
7. Why this appears to be a defect, plus alternative explanations and limitations.
8. **Regression-test plan:** test file(s), scenario(s), expected assertions, and why the tests detect the defect. Include both a test that captures the bug and checks for the corrected behavior, plus existing tests that must remain passing. Do not claim tests have been added or passed unless that is true.
9. Acceptance criteria, including targeted regression test(s) and the full test suite.
10. Explicit human approval gate: no source or test changes before approval. After approval, implement the smallest safe fix, add/update tests, run tests, and report the diff.
11. Post-fix report-update requirement: document the actual code change, tests changed, exact test commands and outcomes, and unresolved limitations. Keep the report open if tests fail.

Only file a bug when evidence indicates a repeatable defect or a concrete instrumentation/design inconsistency. If evidence is suggestive but not conclusive, label it `Hypothesis — needs confirmation` and list the confirmation experiment. Do not invent metrics, line numbers, stack traces, root causes, test results, or test names.

## Expected investigation summary
Report:
- Environment and commands executed.
- Initial test pass/fail status.
- CPU-time observations and workload.
- Memory measurements across comparable samples.
- Event-loop delay (mean/p95/max), ELU, and request latency.
- Measurement-window caveats.
- Findings separated into observed facts, hypotheses, and conclusions.
- Whether a bug report was created and its exact path.
- Confirmation that application source, tests, and package configuration were not changed during profiling.
- Cleanup result, including port 3000 status.

## Failure handling
If a command fails, capture the exact error and stop dependent steps. Do not silently retry destructive or long-running commands. Ask the user before editing application code, modifying tests, installing dependencies, binding to a non-loopback interface, or increasing workload.

---
