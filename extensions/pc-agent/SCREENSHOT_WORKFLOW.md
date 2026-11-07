# Screenshot-to-ChatGPT workflow

This fork supports a verified, two-step screenshot workflow through the connected Remote Desktop Commander:

1. Run `python extensions/pc-agent/pc_agent.py screenshot` on the authorized Windows device via `start_process`.
2. Read the returned `saved` image path using Remote Desktop Commander `read_file`. Its image content can be displayed and visually analyzed in ChatGPT.

The screenshot helper captures the interactive desktop, resizes large images to at most 1600 pixels wide, and writes a JPEG (quality 78) to the local user profile `~/.pc-agent`. This lowers transfer size. No continuous capture or automatic upload is enabled.

**Verified on Windows:** 1920×1080 screenshot converted to 1600×900 JPEG (149,535 bytes), read back through the Remote Desktop Commander image response and visually inspected.

**Current limitation:** This is not a single new native MCP `take_screenshot` tool; it uses the existing `start_process` and `read_file` tools. Native registration, image redaction, monitor/window selection, capture permission prompts, and screenshot retention policy are future work.

Never commit screenshots, tokens, or personal data to this public repository. Screenshots may contain private content.
