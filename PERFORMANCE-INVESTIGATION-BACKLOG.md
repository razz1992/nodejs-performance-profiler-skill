# Performance Investigation Backlog

**Purpose:** Single review queue for performance bugs and enhancements found by the Node.js profiling skill. Review weekly or biweekly. Approval is per ID, not blanket approval.

## Review rules

- Each item has a stable, sequential ID. Never reuse IDs.
- At each weekly/biweekly review, record an explicit decision per item: approve, defer, reject, or request more evidence.
- Only an explicitly approved ID may be implemented. Approval of one item does not authorize related work.
- All unapproved items remain untouched. Investigation and this backlog are not permission to modify source, tests, configuration, or dependencies.
- Estimated improvement is not a guarantee. Record the basis, uncertainty, and how it will be measured. Use `Unknown — baseline/experiment required` when there is not enough evidence.
- Keep detailed reproduction and test plans in a linked report. Update this table after each review and after verification.

## Backlog

| ID | Type | Area | Finding | Evidence | Current-system impact | Proposed change | Estimated improvement | Effort/risk | Status | Test/verification plan | Review date/cycle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PERF-001 | Bug | Event loop / observability | Diagnostics combines interval CPU/ELU deltas with delay-histogram statistics accumulated over a different window. | Five concurrent `/work?n=2000000` requests took approximately 161.87 ms overall; observed per-request latencies were 36.40, 66.68, 98.34, 127.28, and 159.70 ms. Delay max changed from 49.447 ms to 125.108 ms, while p95 remained 35.160 ms and mean changed from 30.209 ms to 30.318 ms. This supports a measurement-window inconsistency, not a proven cause for the max. | Operators/developers may compare non-aligned measurements and draw misleading conclusions about the timing or severity of stalls. Confidence is high for the window mismatch; impact on decisions requires validation. | Define and expose consistent or explicitly labelled histogram windows; choose implementation only after review. | Diagnostic interpretability: expected improvement is qualitative. No claim of runtime performance gain; validate with successive diagnostics reads and a controlled experiment. | Low-to-medium estimated; API semantics and Node.js histogram lifecycle need review. | Ready for review | Follow `BUG-event-loop-histogram-window.md`: successive-read contract tests, startup/low-sample handling, existing endpoint tests, full `node --test test/*.test.js`, and controlled idle/work comparison. | Pending first weekly/biweekly review |
| PERF-002 | Enhancement | Thread pool | Establish a reproducible baseline for relevant libuv worker-pool workloads and distinguish queueing symptoms from event-loop blocking. | Investigation required. Inspect `scripts/threadpool-check.js` and actual asynchronous APIs before executing; no new results claimed. | Current visibility into worker-pool queueing/saturation is not yet established. Without a baseline, slow async operations may be misattributed to the event loop or CPU. | Inspect existing experiment, define a bounded local baseline, and document what can/cannot be inferred from available metrics. Any pool-size/configuration change requires a separate approved ID. | Unknown — baseline/experiment required. Compare latency distribution and throughput at bounded concurrency; do not promise gains. | Low-to-medium estimated; workload safety and interpretation need review. | Needs evidence | Inspect script/source first; run existing tests; run only a bounded experiment after confirming its workload; record concurrency, duration, throughput, latency, environment, and limitations. No source/test edits. | Pending first weekly/biweekly review |

## Decision log

Record one line per reviewed item and cycle. Include date, reviewer/decision, approved scope, and conditions. Do not treat silence or a general request to investigate as implementation approval.

| Date | Cycle | ID | Decision | Approved scope / conditions | Reviewer notes |
|---|---|---|---|---|---|
| Pending | Weekly/biweekly | PERF-001 | Pending | No implementation approval yet | |
| Pending | Weekly/biweekly | PERF-002 | Pending | Investigation baseline only; no configuration/source changes | |

## Status definitions

- **Needs evidence:** insufficient evidence to recommend a specific change.
- **Ready for review:** evidence and verification plan are documented; awaiting an individual decision.
- **Approved:** the human explicitly approved this ID and its stated scope.
- **Deferred:** revisit in a later review cycle; do not implement.
- **Rejected:** do not implement; retain the record for traceability.
- **In progress:** approved work is actively being implemented.
- **Blocked:** work cannot proceed safely or a required check failed.
- **Verified:** approved change passed required tests and comparable validation; evidence is recorded.
