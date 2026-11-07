"""PC Agent: local, opt-in Windows helper for Desktop Commander.
Usage: python pc_agent.py status|windows|clipboard|screenshot|adb|projects
No network listener, no background monitoring, no privileged operations.
"""
import argparse, ctypes, json, os, pathlib, shutil, subprocess, sys, datetime, importlib.util
BASE = pathlib.Path(__file__).resolve().parent
def output(data): print(json.dumps(data, ensure_ascii=False, indent=2, default=str))
def run(cmd, timeout=12):
    try:
        p=subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace")
        return {"ok":p.returncode==0,"stdout":p.stdout.strip(),"stderr":p.stderr.strip()}
    except Exception as e: return {"ok":False,"error":str(e)}
def windows():
    if os.name!="nt": return {"error":"Windows only"}
    from ctypes import wintypes
    u=ctypes.windll.user32
    u.EnumWindows.argtypes=[ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM),wintypes.LPARAM]
    results=[]
    @ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
    def cb(hwnd, _):
        if u.IsWindowVisible(hwnd):
            n=u.GetWindowTextLengthW(hwnd)
            if n:
                buf=ctypes.create_unicode_buffer(n+1);u.GetWindowTextW(hwnd,buf,n+1)
                if buf.value.strip():results.append({"title":buf.value,"hwnd":int(hwnd)})
        return True
    u.EnumWindows(cb,0)
    return results[:150]
def clipboard():
    if os.name!="nt": return {"error":"Windows only"}
    # Only current text, NOT Windows Win+V pinned clipboard history.
    script="Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()"
    r=run(["powershell","-NoProfile","-STA","-Command",script])
    return {"note":"Current clipboard text only; pinned history is not exposed here","result":r}
def screenshot():
    try:
        from PIL import ImageGrab
        dest=BASE/("screen_"+datetime.datetime.now().strftime("%Y%m%d_%H%M%S")+".png")
        ImageGrab.grab().save(dest)
        return {"saved":str(dest)}
    except Exception as e: return {"error":str(e),"hint":"Install Pillow: python -m pip install pillow"}
def projects():
    return {"configured_roots":[],"note":"No project roots configured; no filesystem scan performed."}
def main():
    p=argparse.ArgumentParser();p.add_argument("action",choices=["status","windows","clipboard","screenshot","adb","projects"])
    a=p.parse_args().action
    if a=="status": result={"python":sys.version.split()[0],"platform":sys.platform,"agent_dir":str(BASE),"pillow":__import__("importlib").util.find_spec("PIL") is not None,"adb":shutil.which("adb"),"actions":["status","windows","clipboard","screenshot","adb","projects"]}
    elif a=="windows":result=windows()
    elif a=="clipboard":result=clipboard()
    elif a=="screenshot":result=screenshot()
    elif a=="adb":result=run(["adb","devices","-l"]) if shutil.which("adb") else {"error":"adb not found"}
    else:result=projects()
    output(result)
if __name__=="__main__":main()
