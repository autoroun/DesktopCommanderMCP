# Persistent verification jobs

This feature **does not keep a ChatGPT conversation open**. It persists a local queue of allowlisted test commands so that the next MCP session can inspect results.

MCP tools: `queue_verification`, `verification_status`, `run_next_verification`, `stop_queued_verification`.

Allowed jobs: `syntax-check`, `security-tests`, `mcp-tests`. Arbitrary shell commands, autonomous code editing, unattended Git pushes, and recursive self-restarting agents are not supported.

Run a job manually:
```powershell
python job_runner.py add --kind syntax-check --title "Syntax verification"
python job_runner.py tick
python job_runner.py status
```

To process queued jobs while the terminal stays open, run `python job_runner.py worker --interval 15`. The worker waits between checks and does not create jobs itself. Stop with Ctrl+C. To cancel a queued job use `python job_runner.py stop --id 2`. A running job finishes its bounded execution and cannot be interrupted by the queue stop command.

The queue is saved to `%USERPROFILE%\.pc-agent\jobs.sqlite`, not to GitHub. On process crash, a job marked `running` stays in that state and needs manual reconciliation; it is not automatically rerun. Each job has a 45-second timeout.

This is a **verification queue**, not a full autonomous software developer. An independent coding agent with explicit authorization and safeguards would be needed for continuous feature development.
