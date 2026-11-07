"""Integration test: actual stdio MCP initialization and image tool result."""
import asyncio, pathlib, sys, os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
async def main():
    script=pathlib.Path(__file__).with_name("mcp_server.py")
    params=StdioServerParameters(command=sys.executable,args=[str(script)])
    async with stdio_client(params) as (read,write):
        async with ClientSession(read,write) as session:
            await session.initialize()
            tools=(await session.list_tools()).tools
            names={t.name for t in tools}
            assert {"take_screenshot","mouse_click","sqlite_select","adb_devices"}<=names
            images=[]
            if not os.environ.get("CI"):
                shot=await session.call_tool("take_screenshot",{"max_width":900})
                assert not shot.isError,shot
                images=[x for x in shot.content if x.type=="image"]
                assert len(images)==1
                assert images[0].mimeType=="image/jpeg"
            windows=await session.call_tool("list_windows",{})
            assert not windows.isError
            print("MCP OK; tools:",len(tools),"screenshot image:",len(images[0].data) if images else "skipped in CI","base64 chars; windows result:",len(windows.content))
asyncio.run(main())
