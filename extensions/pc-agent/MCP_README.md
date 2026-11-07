# PC Agent Extended — native MCP companion

An optional **stdio MCP server** providing 13 tools for Windows desktop interaction. It runs separately from the existing Remote Desktop Commander process, so the current remote connection is not modified.

## Install on Windows

Prerequisites: Python 3.10+, interactive Windows desktop. In PowerShell from this directory:

```powershell
powershell -File .\install-mcp.ps1
python .\test_mcp.py
```

The installer installs dependencies, verifies syntax, and generates `mcp-config.example.json` with the Python executable and MCP server path for the current computer. Add that `mcpServers.pc-agent-extended` entry to a **compatible MCP client**. The installer does **not** change an existing client's configuration or automatically connect the server to ChatGPT.

## Available MCP tools
- `take_screenshot`: returns an actual JPEG image as MCP image content (not a path)
- `list_windows`: visible Windows titles/handles
- `current_clipboard`: current clipboard text only
- `clipboard_history_status`: reports pinned-history limitation
- `mouse_click`, `mouse_drag`, `mouse_scroll`: GUI actions
- `keyboard_type`, `keyboard_hotkey`: keyboard actions
- `list_project_files`: project-root allowlisted listing
- `sqlite_select`: SQLite SELECT with read-only connection and authorizer
- `adb_devices`: list ADB devices
- `adb_screenshot`: Android screenshot for explicit device serial

## Permission configuration
Create `%USERPROFILE%\.pc-agent\config.json`:
```json
{"project_roots":["C:\\MyProjects"],"enable_gui_actions":false}
```
GUI automation is disabled by default. Set true only for supervised operation. PyAutoGUI corner failsafe remains enabled. Project directory restrictions apply to the companion tools; they do not constrain other tools in the existing Desktop Commander. Local audit metadata is saved under `%USERPROFILE%\.pc-agent\mcp-audit.jsonl`.

## Limitations
- Win+V pinned clipboard history is **not** implemented.
- ADB requires Android platform-tools separately installed and on PATH.
- MySQL management, APK installation and native integration into the remote plugin's exposed tool list are not implemented.
- Screenshot captures may include private information. Do not run on an unattended machine.
- The MCP companion uses stdio. It is not a remotely hosted or authenticated network endpoint.
- `keyboard_type` uses PyAutoGUI typing; non-ASCII text support is limited.
- Avoid opening this MCP server to untrusted clients. This is not an OS security sandbox.

## Verification
Run `python test_mcp.py` to initialize a real MCP stdio session, enumerate tools, capture an image, and list windows.
