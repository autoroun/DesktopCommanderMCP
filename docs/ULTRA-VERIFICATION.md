# Desktop Commander Ultra — verification report

Date: 2026-11-18
Target: Windows device DESKTOP-9ACO4DC, Node.js v24.13.1.

## Single Full Access profile

The fork now exposes one profile only: **FULL_ACCESS**, with internal `blockedCommands=[]` and `allowedDirectories=[]` as defaults and enforced effective values. The previous enable/disable API and UI toggles were removed. Legacy configurations are migrated at startup; the configuration editor does not allow re-creating an alternate restricted mode. OS permission boundaries, Windows UAC, device authentication, and ChatGPT/Claude client approvals remain external and unchanged.

## Dedicated end-to-end checks

PASS: MCP tool registration, single-mode schema (no enable/disable), default profile, persistence across MCP restarts, external config-file tampering, denial of legacy restrictions in the settings tool, project scan and Git status, successful command execution, retries and failure reporting, Windows process tree cancellation, bounded concurrent jobs with queue and queued cancellation, audit logging, localhost dashboard availability, dashboard authentication and hostile Host rejection.

The new executable test is `node test/ultra-end-to-end.test.js` (runs `scripts/ultra/smoke.mjs`).

## Upstream regression suite

Command: `node test/run-all-tests.js --no-build`.
Result: **230 of 243 existing test modules passed; 13 failed**. The suite completed in 802.6 seconds.

Failures:
- `docker-installer-restart.test.js`: Windows TEMP cleanup reported EPERM.
- `test-client-results.js`, `test-process-wait-config.js`: expect the legacy command blocking or editability removed from this fork.
- `test-config-bom.js`, `test-config-corrupt-concurrency.js`, `test-config-corrupt-recovery.js`, `test-config-damaged-reset.js`, `test-config-damaged.js`, `test-config-failures.js`: several assertions expect the legacy restrictions to persist after configuration recovery; the fork normalizes these restrictions to empty.
- `test-default-shell.js`: a Windows bash.exe shell expectation did not complete as expected.
- `test-remote-report.js`: one failure in upstream remote-report checks.
- `test-runner-arguments.js`: the threadpool timing reproducer exited with status 1.
- `test-search-memory-unsampled.js`: a search test encountered unexpected extra content while parsing JSON.

These failures are **not** being represented as passes. Old tests about configurable restrictions should be rewritten to validate the new one-profile contract; platform and upstream failures still need independent investigation.

## Operational checks and limits

- TypeScript build and no-emit typecheck passed.
- Windows PowerShell startup scripts parsed with zero syntax errors; existing scheduled task is enabled and targets the hidden launcher.
- No destructive shutdown/restart test was executed on the live desktop. The power tool returns actual Windows command exit codes.
- The admin panel is bound to 127.0.0.1 and actions require a per-process random token; audit files rotate at 10 MiB.
- The remote-host tool catalog may require reconnecting or re-registering tools after a local build.
- A custom build cannot disable user-side OpenAI approvals or Windows elevation controls.

## Installation

Local checkout: `C:\Users\uke\Desktop\projeler\desktop-commander-ultra`.
Build: `npm.cmd run build`.
Autostart installer: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ultra\install-autostart.ps1`.
