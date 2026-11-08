# AI Agent / new conversation instructions

This repository is a fork of Desktop Commander MCP, with a remotely connected Windows device bridge. Its capabilities are published by the MCP server at runtime; do not assume an older fixed ChatGPT tool catalog includes everything.

When a user requests Windows desktop activity, inspect available Remote Desktop Commander tools first. Prefer direct `take_screenshot` / `windows_desktop` if exposed. If omitted by the host, use `start_process` to launch `dist/windows-desktop-cli.js`, observe first, then use `interact_with_process` for each verified step; read images on the device with `read_file`. Do not invent sandbox links or claim screenshot presentation without confirmation.

Windows Commander MCP is an optional inspection companion installed at `%LOCALAPPDATA%\Programs\windows-commander-mcp\WindowsCommander.McpServer.exe`. If `windows_companion_list_tools` and `windows_companion_call_tool` are exposed by the connected MCP server, use those first for Windows window/process/UI/monitor/service inspection. Their allowed operations are read-only. If absent, do not pretend they are accessible; use existing native tools, or inspect the companion via a local terminal on the authorized device when appropriate.

Respect allowed directories, blocked commands, confirmations, user authorization, password privacy and desktop observation freshness. Never use a generic companion tool to bypass any access boundary.

For screenshot delivery requests, prefer the verified `share_screenshot` link unless this exact MCP client is proven to render inline images. If inline image presentation is not confirmed, use `share_screenshot` (or fallback CLI `node dist/screenshot-share-cli.js --minutes=10` via `start_process`) to create a verified short-lived HTTPS link and put it in the chat. The link is served from an isolated screenshot-only Cloudflare Quick Tunnel and expires; never pretend an image was attached just because it was read by the agent. If verification fails, say delivery failed.

For architecture and validation see [docs/windows-companion-mcp.md](docs/windows-companion-mcp.md). To change the fork, update TypeScript in `src`, tests in `test`, compile with `npm run build`, verify, and only then push to GitHub. Running devices need a controlled service restart to advertise new tool capabilities.
