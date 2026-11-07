"""Optional PC Agent MCP server: explicit, auditable tools for Windows."""
from __future__ import annotations
import json, pathlib, subprocess, sqlite3, shutil, os, datetime, re, io
from mcp.server.fastmcp import FastMCP, Image
from PIL import ImageGrab
import pyautogui
import pyperclip

mcp=FastMCP("PC Agent Extended")
HOME=pathlib.Path.home()/".pc-agent"
CONFIG=HOME/"config.json"
pyautogui.FAILSAFE=True
pyautogui.PAUSE=0.15

def cfg():
    try:return json.loads(CONFIG.read_text(encoding="utf-8-sig"))
    except (OSError,ValueError):return {}
def log(action):
    HOME.mkdir(exist_ok=True)
    with (HOME/"mcp-audit.jsonl").open("a",encoding="utf-8") as f:
        f.write(json.dumps({"utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"action":action})+"\n")
def permitted(p):
    target=pathlib.Path(p).expanduser().resolve()
    for root in cfg().get("project_roots",[]):
        base=pathlib.Path(root).expanduser().resolve()
        if target==base or base in target.parents:return target
    raise PermissionError("Path outside configured project_roots")
def gui():
    if not cfg().get("enable_gui_actions",False):raise PermissionError("GUI disabled in local config")
def adb_cmd(args):
    if not shutil.which("adb"):return "ADB not installed/on PATH"
    p=subprocess.run(["adb",*args],capture_output=True,text=True,timeout=20,encoding="utf-8",errors="replace")
    return json.dumps({"exit_code":p.returncode,"output":p.stdout[:8000],"errors":p.stderr[:2000]})

@mcp.tool()
def take_screenshot(max_width:int=1600)->Image:
    """Capture the current interactive desktop and return image directly for ChatGPT vision."""
    log("take_screenshot")
    if not 320<=max_width<=3840:raise ValueError("max_width 320..3840")
    shot=ImageGrab.grab()
    if shot.width>max_width:shot.thumbnail((max_width,3840))
    stream=io.BytesIO()
    shot.convert("RGB").save(stream,format="JPEG",quality=78,optimize=True)
    return Image(data=stream.getvalue(),format="jpeg")

@mcp.tool()
def list_windows()->list[dict]:
    """List titles and handles of visible desktop windows."""
    log("list_windows")
    import ctypes
    from ctypes import wintypes
    u=ctypes.windll.user32
    CB=ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
    u.EnumWindows.argtypes=[CB,wintypes.LPARAM]
    found=[]
    @CB
    def cb(hwnd,_):
        if u.IsWindowVisible(hwnd):
            n=u.GetWindowTextLengthW(hwnd)
            if n:
                b=ctypes.create_unicode_buffer(n+1);u.GetWindowTextW(hwnd,b,n+1)
                if b.value.strip():found.append({"title":b.value,"handle":int(hwnd)})
        return True
    u.EnumWindows(cb,0)
    return found[:100]

@mcp.tool()
def current_clipboard()->str:
    """Read current clipboard text, not pinned Win+V clipboard history."""
    log("current_clipboard")
    return pyperclip.paste()[:20000]

@mcp.tool()
def clipboard_history_status()->str:
    """Explain pinned Windows clipboard history availability."""
    return "Win+V pinned history is not exposed by this agent; current_clipboard works. Do not claim pinned history is readable."

@mcp.tool()
def mouse_click(x:int,y:int,button:str="left")->str:
    """Click a screen coordinate; requires enable_gui_actions in local config."""
    gui();log("mouse_click")
    if button not in ("left","right","middle"):raise ValueError("Invalid button")
    pyautogui.click(x=x,y=y,button=button)
    return f"Clicked {button} at {x},{y}"

@mcp.tool()
def keyboard_type(text:str,interval:float=0.03)->str:
    """Type text into currently focused window. Explicit GUI permission required."""
    gui();log("keyboard_type")
    if len(text)>2000:raise ValueError("Text too long")
    if not 0<=interval<=0.2:raise ValueError("Invalid interval")
    pyautogui.write(text,interval=interval)
    return f"Typed {len(text)} characters"

@mcp.tool()
def keyboard_hotkey(keys:list[str])->str:
    """Send a hotkey, e.g. ['ctrl','a']. GUI permission required."""
    gui();log("keyboard_hotkey")
    allowed={"ctrl","shift","alt","win","enter","tab","esc","up","down","left","right","a","c","v","x","z","s","f","home","end","backspace","delete"}
    if not 1<=len(keys)<=4 or any(k not in allowed for k in keys):raise ValueError("Hotkey not allowlisted")
    pyautogui.hotkey(*keys)
    return "Sent hotkey"

@mcp.tool()
def mouse_scroll(clicks:int)->str:
    """Scroll current desktop; GUI permission required."""
    gui();log("mouse_scroll")
    if abs(clicks)>15:raise ValueError("Max 15")
    pyautogui.scroll(clicks)
    return f"Scrolled {clicks}"

@mcp.tool()
def mouse_drag(x1:int,y1:int,x2:int,y2:int,duration:float=0.5)->str:
    """Drag between two screen coordinates; GUI permission required."""
    gui();log("mouse_drag")
    if not 0.2<=duration<=3:raise ValueError("Duration 0.2..3")
    pyautogui.moveTo(x1,y1);pyautogui.dragTo(x2,y2,duration=duration)
    return "Drag completed"

@mcp.tool()
def list_project_files(path:str)->list[dict]:
    """List files only under configured project_roots."""
    log("list_project_files")
    p=permitted(path)
    return [{"name":x.name,"directory":x.is_dir()} for x in sorted(p.iterdir())[:150] if not x.is_symlink()]

@mcp.tool()
def sqlite_select(path:str,query:str)->list[dict]:
    """Read-only SQLite SELECT query within an allowed project directory."""
    log("sqlite_select")
    p=permitted(path)
    if not re.match(r"^\s*select\b",query,re.I) or ";" in query:raise ValueError("Single SELECT only")
    con=sqlite3.connect(p.as_uri()+"?mode=ro",uri=True)
    try:
        con.set_authorizer(lambda action,*args:sqlite3.SQLITE_OK if action in (sqlite3.SQLITE_SELECT,sqlite3.SQLITE_READ,sqlite3.SQLITE_FUNCTION) else sqlite3.SQLITE_DENY)
        con.row_factory=sqlite3.Row
        return [dict(x) for x in con.execute(query).fetchmany(100)]
    finally:con.close()

@mcp.tool()
def adb_devices()->str:
    """List authorized Android devices."""
    log("adb_devices")
    return adb_cmd(["devices","-l"])

@mcp.tool()
def adb_screenshot(serial:str)->Image:
    """Capture Android display of explicitly selected ADB serial."""
    log("adb_screenshot")
    if not re.fullmatch(r"[a-zA-Z0-9.:_-]{1,100}",serial):raise ValueError("Invalid serial")
    if not shutil.which("adb"):raise RuntimeError("ADB unavailable")
    p=subprocess.run(["adb","-s",serial,"exec-out","screencap","-p"],capture_output=True,timeout=25)
    if p.returncode:raise RuntimeError(p.stderr.decode(errors="replace")[:300])
    return Image(data=p.stdout,format="png")

@mcp.tool()
def queue_verification(title:str,kind:str)->dict:
    """Queue an allowlisted verification job, independent of the chat session."""
    import job_runner
    if kind not in job_runner.COMMANDS:raise ValueError("Unsupported verification kind")
    log("queue_verification")
    return job_runner.add(title[:120],kind)

@mcp.tool()
def verification_status()->list[dict]:
    """Read recent persistent verification job statuses."""
    import job_runner
    return job_runner.status()

@mcp.tool()
def run_next_verification()->dict:
    """Execute one queued verification job, with a 45-second timeout."""
    import job_runner
    log("run_next_verification")
    return job_runner.tick()

@mcp.tool()
def stop_queued_verification(job_id:int)->dict:
    """Cancel a job that has not yet started."""
    import job_runner
    log("stop_queued_verification")
    return job_runner.stop(job_id)

if __name__=="__main__":mcp.run(transport="stdio")
