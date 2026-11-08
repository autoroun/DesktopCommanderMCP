/**
 * Local Windows Commander MCP companion for the remote Desktop Commander fork.
 * Exposes only metadata/inspection tools: no arbitrary shell, filesystem reads,
 * registry changes, process termination or unguarded mouse/keyboard injection.
 * Write operations must continue through Desktop Commander's own guarded tools.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const READ_ONLY_TOOLS = new Set([
    'list_processes', 'get_process_details', 'list_windows', 'find_window',
    'enumerate_child_windows', 'get_cursor_position', 'get_screen_details',
    'get_screen_at_point', 'get_system_info', 'get_display_metrics',
    'get_window_screen_info', 'identify_screens', 'list_services',
    'list_installed_apps', 'read_ui_tree', 'find_ui_element',
    'get_ui_element_details', 'get_control_indicator_status',
    'capture_screen', 'capture_screen_region',
]);

type AvailableTool = { name: string; description?: string; inputSchema?: unknown };
type CompanionState = {
    client: Client;
    transport: StdioClientTransport;
    tools: AvailableTool[];
};
let current: CompanionState | undefined;
let connecting: Promise<CompanionState> | undefined;

export function windowsCompanionExecutable(): string | undefined {
    if (process.platform !== 'win32') return undefined;
    const home = process.env.LOCALAPPDATA;
    if (!home) return undefined;
    // Use the documented, local per-user installation directory. Do not accept
    // tool-supplied paths or configuration from untrusted web/page contents.
    const executable = path.join(home, 'Programs', 'windows-commander-mcp', 'WindowsCommander.McpServer.exe');
    return existsSync(executable) ? executable : undefined;
}

async function openCompanion(): Promise<CompanionState> {
    if (current) return current;
    if (connecting) return connecting;
    connecting = (async () => {
        const exe = windowsCompanionExecutable();
        if (!exe) throw new Error('Windows Commander MCP is not installed in the standard per-user location.');
        const transport = new StdioClientTransport({
            command: exe,
            args: [],
            stderr: 'pipe',
        });
        const client = new Client({
            name: 'desktop-commander-windows-companion',
            version: '1.0.0',
        });
        try {
            await client.connect(transport);
            const listed = await client.listTools(undefined, { timeout: 15000 });
            const tools = listed.tools.filter(tool => READ_ONLY_TOOLS.has(tool.name));
            const state: CompanionState = { client, transport, tools };
            client.onclose = () => {
                if (current?.client === client) current = undefined;
            };
            current = state;
            return state;
        } catch (error) {
            try { await client.close(); } catch { /* ignore */ }
            try { await transport.close(); } catch { /* ignore */ }
            throw error;
        }
    })();
    try {
        return await connecting;
    } finally {
        connecting = undefined;
    }
}

/** Close the optional child cleanly during tests and gateway shutdown. */
export async function closeWindowsCompanion(): Promise<void> {
    const state = current;
    current = undefined;
    if (!state) return;
    try { await state.client.close(); } catch { /* already closed */ }
    try { await state.transport.close(); } catch { /* already closed */ }
}

export async function listWindowsCompanionTools(): Promise<any> {
    if (process.platform !== 'win32') {
        return { content: [{ type: 'text', text: 'Windows Commander companion requires Windows.' }] };
    }
    try {
        const state = await openCompanion();
        return { content: [{
            type: 'text',
            text: JSON.stringify({
                connected: true,
                companion: 'Windows Commander MCP',
                count: state.tools.length,
                tools: state.tools.map(tool => ({
                    name: tool.name,
                    description: tool.description ?? '',
                    inputSchema: tool.inputSchema,
                })),
                note: 'Only inspected read-only tools are exposed. Use guarded Desktop Commander tools for changes.',
            }),
        }] };
    } catch (error) {
        return { content: [{
            type: 'text',
            text: 'Windows Commander companion unavailable: ' + String((error as Error).message),
        }], isError: true };
    }
}

export async function callWindowsCompanionTool(input: unknown): Promise<any> {
    if (!input || typeof input !== 'object') throw new Error('Expected companion tool name and arguments.');
    const { name, arguments: args } = input as { name?: unknown; arguments?: unknown };
    if (typeof name !== 'string' || !READ_ONLY_TOOLS.has(name)) {
        return { content: [{ type: 'text', text: 'Tool is not in the read-only Windows companion allowlist.' }], isError: true };
    }
    if (args !== undefined && (args === null || Array.isArray(args) || typeof args !== 'object')) {
        return { content: [{ type: 'text', text: 'arguments must be a JSON object.' }], isError: true };
    }
    try {
        const state = await openCompanion();
        if (!state.tools.some(tool => tool.name === name)) {
            return { content: [{ type: 'text', text: 'Companion does not provide this tool: ' + name }], isError: true };
        }
        return await state.client.callTool({
            name,
            arguments: (args ?? {}) as Record<string, unknown>,
        }, undefined, { timeout: 25000 });
    } catch (error) {
        // Reconnect on the next call if the companion process has exited.
        if (current) {
            try { await current.client.close(); } catch { /* ignore */ }
            current = undefined;
        }
        return { content: [{
            type: 'text',
            text: 'Windows companion call failed: ' + String((error as Error).message),
        }], isError: true };
    }
}
