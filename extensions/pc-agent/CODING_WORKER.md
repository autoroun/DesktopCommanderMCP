# Opt-in coding worker (Claude Code CLI)

The local coding worker can request a small code improvement from a **locally installed and authenticated Claude Code CLI**, then run regression tests. It does not manipulate or keep ChatGPT sessions alive.

## Safeguards
- Only runs when explicitly started. No auto-start service installed.
- Max 20 cycles per invocation; defaults to **one**.
- Per-call API budget defaults to $0.50 and is capped at $2.00 (actual billing depends on CLI account).
- Claude CLI permissions remain active; no `--dangerously-skip-permissions`.
- Only allowlisted read/edit/write and limited test/git-inspection tools requested.
- Requires clean Git working tree; checks changed files remain under `extensions/pc-agent`.
- Runs security and MCP integration tests after code changes.
- Stops after any change or failure for review; does not auto-commit or auto-push.
- Stop request via `python coding_worker.py stop`; active CLI call may continue until its timeout.
- Local state and audit logs stored under `%USERPROFILE%\.pc-agent`.

## Commands
```powershell
python coding_worker.py status
python coding_worker.py once --budget 0.50
python coding_worker.py start --cycles 3 --budget 0.50
python coding_worker.py stop
python coding_worker.py clear-stop
```

**Important:** This is bounded autonomous coding, not an endless agent. It requires a working Claude Code account and local permissions. Never assume CLI authentication or billing availability. It does not guarantee correct code: review all diffs and tests before committing. A failing or suspicious change should be reverted manually after inspection.

No persistent background service is started by default. The CLI can still access capabilities allowed by its own configuration; run only in a trusted repository and preferably an isolated environment.
