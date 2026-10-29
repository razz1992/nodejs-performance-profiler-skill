# BUG: Event-loop delay histogram and interval metrics use different windows

**Backlog ID:** PERF-001  
**Status:** Ready for weekly/biweekly review — not approved for implementation  
**Classification:** Instrumentation / diagnostic accuracy  
**Confidence:** High that the measurement windows differ; the exact impact on every reported sample requires validation  
**Scope:** Event-loop diagnostics. Thread-pool behavior is tracked separately in `PERF-002`.

## Summary

The `/diagnostics` endpoint calculates CPU time and event-loop utilization as deltas since the previous diagnostics call, but the event-loop delay histogram is enabled once at process startup and is not reset when diagnostics are read. One response can therefore combine interval-based values with delay statistics accumulated over a longer process-lifetime window. Direct comparisons between these fields can be misleading.

This is an instrumentation inconsistency. It does not prove that an earlier extreme event-loop maximum was a real stall or establish the cause of that outlier.

## Relevant code

- `src/server.js`
  - `delayHistogram` is created and enabled near the top of the file.
  - `diagnostics()` uses `process.cpuUsage(previousCpu)` and `performance.eventLoopUtilization(previousElu)`, then updates the previous CPU/time/ELU snapshots.
  - The same function reads `delayHistogram.mean`, `delayHistogram.percentile(95)`, and `delayHistogram.max` without resetting the histogram.

Confirm these details against the current files before making any change. Line numbers are omitted because they may change.

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

If PowerShell background jobs are unsuitable, use an equivalent small local client script. Keep the request count and iteration cap unchanged. This experiment is illustrative; tests must not depend on exact timing values.

## Observed evidence from the learning experiment

The observed sample used five concurrent requests to `/work?n=2000000`:

- Burst duration: approximately 161.87 ms.
- Individual observed response latencies: 36.40, 66.68, 98.34, 127.28, and 159.70 ms.
- Before the burst: maximum delay 49.447 ms, p95 delay 35.160 ms, mean delay 30.209 ms, ELU 0.26%.
- After the burst: maximum delay 125.108 ms, p95 delay 35.160 ms, mean delay 30.318 ms, ELU 51.23%.

The maximum increased by approximately 75.661 ms while p95 and mean were almost unchanged. This is consistent with a short outlier, but does not establish that the metric-window inconsistency caused the observed maximum. The histogram accumulated data across both observations.

## Expected versus actual behavior

**Expected:** A diagnostics response should make the observation window explicit and avoid presenting delay statistics from a different window as if they described the same interval as CPU-time and ELU deltas.

**Actual:** CPU and ELU are interval deltas between diagnostics calls, while the delay histogram reports accumulated statistics since it was enabled (unless reset elsewhere). The response does not expose this distinction to consumers.

## Current-system impact

Developers or operators may compare non-aligned measurements and draw misleading conclusions about the timing or severity of event-loop stalls. Confidence is high for the measurement-window mismatch; the degree of practical impact needs validation.

## Proposed change

After individual approval of `PERF-001`, evaluate the smallest safe approach to window-aligned diagnostics. Options include resetting the histogram after reading its statistics (where supported by the project's Node.js version) or explicitly reporting the histogram's cumulative window. Verify `monitorEventLoopDelay()` semantics for the project's Node.js version before selecting an approach. Do not assume reset-after-read is automatically correct; preserve a useful sampling period and define startup/low-sample behavior.

**Estimated improvement:** Qualitative improvement in diagnostic interpretability; no runtime performance gain is claimed. Validate through successive diagnostics reads and a controlled idle-versus-work experiment.

## Regression-test plan — required after approval

The coding agent must inspect current tests and implementation before choosing exact test names or test seams. Tests should verify the chosen window semantics without fragile machine-dependent thresholds.

1. **Diagnostics response contract**
   - Exercise `/diagnostics` at least twice in one server process.
   - Assert delay fields and their window semantics match the approved design (interval-based or explicitly labelled cumulative).
   - Validate numeric/valid values when the histogram has insufficient samples, including documented sentinel values.
2. **Successive-read behavior**
   - Distinguish interval values from cumulative values across two reads.
   - If the fix resets the histogram, verify the second response represents a fresh observation window after sufficient sampling; a reset alone does not guarantee an immediate non-empty histogram.
   - If cumulative values are retained, verify the API labels the window clearly.
3. **Existing endpoint coverage**
   - Keep health, work, and diagnostics endpoint tests passing.
   - Preserve response compatibility unless the approved design explicitly changes the contract; document intentional changes.
4. **Commands**
   - Run targeted regression tests first, then `node --test test/*.test.js`.
   - Record exact test names, commands, pass/fail counts, and relevant output.

These are test expectations, not claims that tests have been added or passed. Avoid exact millisecond thresholds and flaky sleep-based assertions where a deterministic test seam is possible.

## Acceptance criteria

- The API documents or implements a clear event-loop delay measurement window.
- Delay statistics and interval CPU/ELU metrics are aligned, or the response explicitly labels differing windows.
- Regression tests cover successive reads and the approved semantics.
- Tests handle startup/low-sample conditions and avoid brittle timing thresholds.
- A controlled idle-versus-CPU-work experiment shows understandable, repeatable behavior.
- Existing health, work, and diagnostics behavior remains covered.
- Targeted tests and `node --test test/*.test.js` pass.
- Exact diff, test names, commands, outcomes, and limitations are recorded.

## Approval gate and review cadence

**Do not modify `src/server.js` or test files based solely on this report.** `PERF-001` must be individually approved in the weekly/biweekly backlog review. A coding agent may prepare a written patch proposal before approval, but must not modify source or tests. Approval of this ID does not authorize changes for any other backlog item. If deferred, rejected, or awaiting evidence, leave implementation untouched. After approval, implement the smallest safe change, run targeted and full tests, and update this report and the backlog. Keep the item open if required checks fail.

