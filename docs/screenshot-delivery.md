# Screenshot delivery — verified link fallback

## Problem and outcome

Capturing a screenshot and returning an MCP `image` content block is not evidence that an arbitrary ChatGPT client rendered the pixels in the user-visible response. A model may see the picture while the user receives only text. Do **not** announce delivery merely because `read_file`, `windows_desktop.observe` or `take_screenshot` returned image bytes.

This fork provides two delivery methods:

- `take_screenshot`: native MCP image content for clients that **actually display** it.
- `share_screenshot`: an externally verified temporary HTTPS link. This is the reliable fallback for clients that do not display MCP images. A fixed-tool gateway can call the fallback CLI via `start_process`.

## User experience

When the user says "ss çek gönder" / "send me a screenshot", prefer `share_screenshot` unless inline image support has already been verified in the current chat client.

```json
{"max_width":1600,"ttl_minutes":10}
```

Expected tool result has `status: verified`, `url`, `expires_at`, and `public_https_status: 200`. The link is sent in the ChatGPT response as a clickable HTTPS link with its expiration. Do not claim an in-chat embedded image was delivered without actual host proof.

If `share_screenshot` is absent from a host's fixed tool catalog, use the normal Remote Desktop Commander `start_process` tool to run:

```powershell
& 'C:\nodejs\node.exe' 'C:\Users\uke\DesktopCommanderMCP-Dev\dist\screenshot-share-cli.js' --minutes=10
```

Keep this process running while the link is live. Read the process output until the `SCREENSHOT_DELIVERY_VERIFIED` JSON line appears; send only the HTTPS link and expiration shown there. If `SCREENSHOT_DELIVERY_FAILED` appears, state plainly that delivery was **not** confirmed. Never fabricate a URL or infer that a local file path can be accessed from ChatGPT.

## Security and privacy

- Uses the locally installed Cloudflare Quick Tunnel as temporary HTTPS transport. This forwards screenshot pixels over Cloudflare's network; it is **not** a private, end-to-end encrypted, or permanent image attachment.
- Screenshots are served only from a Node.js HTTP listener on 127.0.0.1 and only at a fresh 256-bit random path ending in `.jpg`.
- The HTTP server cannot browse the computer, execute commands, or serve arbitrary files. It accepts only GET and HEAD for that one exact path.
- The screenshot is kept in memory and the link automatically expires after 1–15 minutes (10 by default). Anyone with the complete URL can see it until expiration, so do not share it widely.
- Every generated link is tested by performing an **external HTTPS GET** and comparing the returned bytes with the original screenshot before it is reported as `verified`. This handles Cloudflare's brief DNS propagation delays by retrying for a bounded interval.
- The local tunnel cannot be relied on as a permanent service; use a fresh screenshot and link for later requests.
- Do not send screenshots to an external transport unless the user requested screenshot delivery or explicitly agreed to it. Never include passwords or access tokens in diagnostic logs.

## Verification and tests

Run `npm run build` and `node --test test/screenshot-share.test.js test/screenshot-tool.test.js test/desktop-guidance.test.js`. On a Windows workstation with Cloudflared installed, run the fallback CLI and confirm `SCREENSHOT_DELIVERY_VERIFIED`. The web address should return JPEG bytes identical to the screenshot, without needing to expose an arbitrary folder or network interface.

The MCP host may need a refresh/reconnect to advertise the newly added `share_screenshot` tool. The fallback CLI remains usable via the old `start_process` tool without waiting for the host catalog to refresh.
