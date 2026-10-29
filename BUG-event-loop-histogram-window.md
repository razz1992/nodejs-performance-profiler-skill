# BUG: Event-loop delay histogram and interval metrics use different windows

**Status:** Needs manual review — do not auto-fix  
**Classification:** Instrumentation / diagnostic accuracy  
**Confidence:** High that the measurement windows differ; the exact impact on every reported sample requires validation  
**Scope:** CPU, memory, and event-loop diagnostics only. Thread-pool investigation is out of scope.

## Summary

The `/diagnostics` endpoint calculates CPU time and event-loop utilization as deltas since the previous diagnostics call, but the event-loop delay histogram is enabled once at process startup and is not reset when diagnostics are read. As a result, one diagnostics response combines interval-based values with delay statistics accumulated over a longer process-lifetime window. This can make direct comparisons between these fields misleading.

This is an instrumentation inconsistency. It does not, by itself, prove that the earlier extreme event-loop maximum was a real stall or establish the cause of that outlier.

## Relevant code

- `src/server.js`
  - `delayHistogram` is created and enabled near the top of the file.
  - `diagnostics()` uses `process.cpuUsage(previousCpu)` and `performance.eventLoopUtilization(previousElu)`, then updates the previous CPU/time/ELU snapshots.
  - The same function reads `delayHistogram.mean`, `delayHistogram.percentile(95)`, and `delayHistogram.max` without resetting the histogram.

Confirm these details against the current files before making changes; line numbers are intentionally omitted because they may change.

## Reproduction

1. Run the current test suite:
   ```powershell
   node --test test/*.test.js
   ```
2. Start the sample server on loopback:
   ```powershell
   node src/server.js
   ```
3. In another terminal, collect an initial diagnostics sample:
   ```powershell
   Invoke-RestMethod http://127.0.0.1:3000/diagnostics | ConvertTo-Json -Depth 5
   ```
4. Send a bounded CPU-work burst from a separate terminal. This uses five concurrent requests, each capped at the application's existing maximum of 2,000,000 iterations:
   ```powershell
   $jobs = 1..5 | ForEach-Object {
     Start-Job -ScriptBlock {
       $timer = [System.Diagnostics.Stopwatch]::StartNew()
       Invoke-RestMethod 'http://127.0.0.1:3000/work?n=2000000' | Out-Null
       $timer.Stop()
       $timer.Elapsed.TotalMilliseconds
     }
   }
   $jobs | Wait-Job | Receive-Job
   $jobs | Remove-Job
   Invoke-RestMethod http://127.0.0.1:3000/diagnostics | ConvertTo-Json -Depth 5
   ```
5. Stop only the server process started for this experiment and verify port 3000 has no listener.

If PowerShell background jobs are unsuitable in the target environment, use an equivalent small local client script. Keep the request count and iteration cap unchanged. This experiment is illustrative; the regression test must not depend on exact timing values.

## Observed evidence from the learning experiment

The observed sample used five concurrent requests to `/work?n=2000000`:

- Burst duration: approximately 161.87 ms.
- Individual observed response latencies: 36.40, 66.68, 98.34, 127.28, and 159.70 ms.
- Before the burst: maximum delay 49.447 ms, p95 delay 35.160 ms, mean delay 30.209 ms, ELU 0.26%.
- After the burst: maximum delay 125.108 ms, p95 delay 35.160 ms, mean delay 30.318 ms, ELU 51.23%.

The maximum increased by approximately 75.661 ms while p95 and mean were almost unchanged. This is consistent with a short outlier, but does not establish that the metric-window inconsistency caused the observed maximum. The histogram accumulated data across both observations.

## Expected behavior

A diagnostics response should make the observation window explicit and avoid presenting delay statistics from a different window as if they described the same interval as CPU-time and ELU deltas.

## Actual behavior

CPU and ELU are interval deltas between diagnostics calls, while the delay histogram reports accumulated statistics since it was enabled (unless the process or histogram is reset elsewhere). The response does not expose this distinction to consumers.

## Proposed regression-test plan — required after human approval

The coding agent must inspect the current test structure and implementation before choosing exact test names or test seams. Add or update tests that verify the chosen window semantics without asserting fragile, machine-dependent timing thresholds.

1. **Diagnostics response contract**
   - Exercise `/diagnostics` at least twice in one server process.
   - Assert the event-loop delay fields and their measurement-window semantics are represented consistently with the approved design (for example, interval-based statistics or explicitly labelled cumulative statistics).
   - Assert the expected fields remain numeric/valid when a histogram has not yet accumulated enough samples, handling any documented sentinel values safely.
2. **Successive-read behavior**
   - Create a controlled test that distinguishes interval values from cumulative values across two diagnostics reads.
   - If the fix resets the histogram, verify the second response represents a fresh observation window after sufficient sampling time; do not assume a reset alone guarantees an immediate non-empty histogram.
   - If the design keeps cumulative histogram values, verify the API labels that window clearly and does not imply interval alignment.
3. **Existing endpoint regression coverage**
   - Keep health, work, and diagnostics endpoint tests passing.
   - Preserve response compatibility unless the approved design explicitly changes the API contract; document any intentional change.
4. **Test commands**
   - Run the targeted regression test(s) first.
   - Then run the complete suite: `node --test test/*.test.js`.
   - Record the exact test names, commands, pass/fail counts, and relevant output in this report.

These are required test expectations, not claims that the tests have already been added or executed. Avoid exact millisecond thresholds and flaky sleep-based assertions where a deterministic test seam can be used.

## Suggested direction for the coding agent

After manual approval, evaluate a minimal, safe approach to window-aligned diagnostics. Options include resetting the histogram after reading its statistics (where supported by the project's Node.js version) or explicitly reporting the histogram's cumulative window. Verify the semantics of `monitorEventLoopDelay()` for the project's Node.js version before choosing an approach. Do not assume resetting after each read is automatically correct; preserve a useful sampling period and define startup/low-sample behavior.

## Acceptance criteria

- The API clearly documents or implements the event-loop delay measurement window.
- Delay statistics and interval CPU/ELU metrics are aligned, or the response explicitly labels their differing windows.
- Regression tests cover successive diagnostics reads and the approved window semantics.
- Tests avoid brittle exact timing thresholds and account for startup or insufficient-sample conditions.
- A controlled idle-versus-CPU-work experiment shows understandable, repeatable behavior.
- Existing health, work, and diagnostics endpoint behavior remains covered.
- Targeted regression tests pass, and `node --test test/*.test.js` passes.
- The coding agent reports the exact diff, test names, commands, pass/fail output, and any limitations.
- This report is updated with the implemented change and verification evidence; it is not marked resolved while required tests fail.

## Manual intervention gate

**Do not modify `src/server.js` or test files based solely on this report.** A human must review and explicitly approve the proposed implementation first. Before approval, a coding agent may prepare a written test plan or patch proposal for review, but must not modify source or tests. After approval, the coding agent must inspect the current files, implement the smallest safe change, add/update the regression tests, run targeted tests and the full suite, then update this report with the actual diff and results. If any required test fails, keep the issue open and report the failure rather than weakening a valid test simply to get a green result.

Do not investigate or change thread-pool behavior as part of this issue.
