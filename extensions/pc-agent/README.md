# Windows PC Agent extension (experimental)
This is a separate on-demand Python helper, **not yet registered as native MCP tools**. It does not modify the installed Desktop Commander remote agent.

## Usage
```powershell
python extensions/pc-agent/pc_agent.py status
python extensions/pc-agent/pc_agent.py windows
python extensions/pc-agent/pc_agent.py clipboard
python extensions/pc-agent/pc_agent.py screenshot
python extensions/pc-agent/pc_agent.py adb
python extensions/pc-agent/pc_agent.py projects
python extensions/pc-agent/pc_agent.py project-files --path C:\\MyProjects
```

Optional Pillow: `python -m pip install pillow`. Android ADB requires Android platform-tools on PATH.

## Permissions
Default: GUI actions **disabled**; project roots **empty**. To opt in, create `%USERPROFILE%\.pc-agent\config.json`:
```json
{
  "project_roots": ["C:\\MyProjects"],
  "enable_gui_actions": false
}
```
Set `enable_gui_actions` to true only when actively supervising the desktop. Then `python extensions/pc-agent/pc_agent.py click --x 200 --y 300` clicks a screen coordinate. No automated click is performed by installation or tests. This is **not** a security sandbox: Desktop Commander itself may have broader filesystem access.

The helper writes audit metadata to `%USERPROFILE%\.pc-agent\audit.jsonl` and screenshots to the same private folder, outside Git. The audit records action names and success, not clipboard content. Do not commit private data or credentials.

## Limitations
Windows Win+V pinned clipboard history is not exposed by this helper. Clipboard reads only the current text. Screenshot and GUI operations need an interactive desktop session. No database write tools or unattended GUI control are implemented yet.

## Next steps
- Windows UI Automation selectors instead of coordinate-only clicks
- Windows clipboard history API feasibility and permissions testing
- ADB discovery and explicit device selection
- Native MCP tool registration with per-tool confirmation
- Installer, automated tests and Windows CI
