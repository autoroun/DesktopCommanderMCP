# Windows MCP Companion — fork guide

This fork supports Windows Commander MCP as an **optional local companion**. It is not a separate ChatGPT connection. The installed Remote Desktop Commander remote device exposes its own MCP tools and talks to the local Windows Commander process on demand.

## New-chat and agent onboarding

- Begin by using the existing Remote Desktop Commander connection and selecting the authorized Windows device.
- For window, monitor, process, service and UI Automation inspection: call `windows_companion_list_tools` to discover live capabilities and exact argument schemas, then `windows_companion_call_tool` with one discovered allowlisted name.
- The companion starts only when needed; it reconnects if its local MCP process exits. Nothing extra needs to remain open in a terminal after Windows sign-in if the Remote Desktop Commander scheduled task is installed.
- For screen screenshots use `take_screenshot` when exposed by the host. For interactive mouse/keyboard/launch tasks use `windows_desktop` with observe -> action -> observe. Do not skip foreground verification; use local saved credential aliases rather than plaintext password in automation input.
- On gateways that publish a fixed MCP catalog and omit new tools, the supported fallback is the installed `windows-desktop-cli.js` bridge via `start_process` + `interact_with_process`. Observe before each action. Image paths from observations refer to files on the remote device, not automatically shareable links.
- Preserve system guards. Companion proxy is intentionally inspection-only; use native Desktop Commander file and terminal tools for changes, respecting their command and directory restrictions.
- Errors, timeouts or absent tools must be reported honestly. Never claim that a screenshot was delivered unless the client confirmed it displayed the actual image.

## Install and discovery

Windows Commander MCP expected location:
`%LOCALAPPDATA%\Programs\windows-commander-mcp\WindowsCommander.McpServer.exe`.

Installation is independent of Desktop Commander; no configuration file is rewritten by this integration. When installed, the companion is launched lazily through the Model Context Protocol (stdio) and only the allowlisted inspection functions are advertised.

The app exposes two extra MCP tools:
- `windows_companion_list_tools` — returns the available inspection tools and their input schemas; on missing package, reports a clear error.
- `windows_companion_call_tool` — uses `name` and optional `arguments`; only names returned by the inspection allowlist can run.

**Do not expose** `execute_powershell`, `execute_process`, file reads and writes, registry modification, arbitrary shell execution, or unrestricted mouse/keyboard injection through the companion proxy: those would circumvent existing Desktop Commander safety boundaries.

## Verification

After `npm run build`, run `node --test test/windows-companion.test.js`. On Windows with the companion installed, the test exercises the real local MCP handshake, discovery, and system information retrieval.

The remote service must reload and register its capabilities to make the new MCP tool metadata available in fresh ChatGPT chats. Merely pushing this repository to GitHub does not update a running connector; a new build and a controlled restart are required.
