# PC Agent (Windows)

Optional Windows helper for the Desktop Commander fork. Runs only on demand; it is not yet wired as a first-class MCP tool.

## Requirements
- Windows and Python 3.10+
- Pillow for screenshots (`python -m pip install pillow`)
- Optional Android platform-tools (`adb` on PATH)

## Usage
From the repository root:

```powershell
python extensions/pc-agent/pc_agent.py status
python extensions/pc-agent/pc_agent.py windows
python extensions/pc-agent/pc_agent.py clipboard
python extensions/pc-agent/pc_agent.py screenshot
python extensions/pc-agent/pc_agent.py adb
python extensions/pc-agent/pc_agent.py projects
```

The clipboard command reads only the **current** clipboard text; Windows Win+V pinned history is not supported. `projects` does not scan files until allowed roots are configured. Screenshots are saved locally and must not be committed. This helper has no listener, background tracking, or administrator privilege escalation.

## Development roadmap
- Explicit per-action permission checks and audit logs
- Native Windows UI Automation with foreground user confirmation
- Clipboard history integration if supported by user-session APIs
- ADB path discovery and device confirmation
- Configurable project roots and safe database connectors
- Tests, CI, and a one-command installer

Do not commit credentials, clipboard content, screenshots, device IDs or local session files.
