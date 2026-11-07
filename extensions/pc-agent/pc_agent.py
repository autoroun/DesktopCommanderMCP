"""Opt-in Windows companion for Desktop Commander. Python 3.10+."""
import argparse, ctypes, datetime, importlib.util, json, os, pathlib, shutil, subprocess, sys
BASE=pathlib.Path(__file__).resolve().parent
DATA=pathlib.Path.home()/".pc-agent"
CONFIG=DATA/"config.json"
def emit(x): print(json.dumps(x,ensure_ascii=False,indent=2,default=str))
def config():
    try: return json.loads(CONFIG.read_text(encoding="utf-8"))
    except (OSError,ValueError): return {"project_roots":[],"enable_gui_actions":False}
def run(args,timeout=12):
    try:
        p=subprocess.run(args,capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=timeout)
        return {"ok":p.returncode==0,"stdout":p.stdout.strip(),"stderr":p.stderr.strip()}
    except Exception as e: return {"ok":False,"error":str(e)}
def audit(action,ok):
    DATA.mkdir(exist_ok=True)
    with (DATA/"audit.jsonl").open("a",encoding="utf-8") as f:
        f.write(json.dumps({"time":datetime.datetime.now(datetime.timezone.utc).isoformat(),"action":action,"ok":ok})+"\n")
def windows():
    if os.name!="nt": return {"error":"Windows only"}
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
                if b.value.strip():found.append({"title":b.value,"hwnd":int(hwnd)})
        return True
    u.EnumWindows(cb,0)
    return found[:150]
def clipboard():
    if os.name!="nt":return {"error":"Windows only"}
    r=run(["powershell","-NoProfile","-STA","-Command","Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()"])
    return {"note":"Current text only; Windows Win+V pinned history is unsupported","result":r}
def screenshot(max_width=1600, quality=78):
    try:
        from PIL import ImageGrab
        if not 320 <= max_width <= 3840 or not 30 <= quality <= 95:
            return {"error":"Invalid image dimensions or quality"}
        DATA.mkdir(exist_ok=True)
        path=DATA/("screen_"+datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")+".jpg")
        shot=ImageGrab.grab()
        original=shot.size
        if shot.width>max_width:
            height=max(1,round(shot.height*max_width/shot.width))
            shot=shot.resize((max_width,height))
        shot.convert("RGB").save(path,format="JPEG",quality=quality,optimize=True)
        return {"saved":str(path),"original_size":original,"image_size":shot.size,"bytes":path.stat().st_size,"next_step":"Use Remote Desktop Commander read_file on saved path to view image in ChatGPT"}
    except Exception as e:return {"error":str(e),"hint":"Install pillow"}
def roots():
    result=[]
    for r in config().get("project_roots",[]):
        p=pathlib.Path(r).expanduser().resolve()
        if p.is_dir():result.append(str(p))
    return result
def project_list():
    return {"roots":roots(),"note":"Configure project_roots in ~/.pc-agent/config.json"}
def project_files(root):
    p=pathlib.Path(root).expanduser().resolve()
    allowed=[pathlib.Path(r) for r in roots()]
    if not any(p==r or r in p.parents for r in allowed):return {"error":"Directory not allowlisted"}
    if not p.is_dir():return {"error":"Not a directory"}
    return [{"name":x.name,"directory":x.is_dir()} for x in sorted(p.iterdir())[:200] if not x.is_symlink()]
def gui_action(a):
    if not config().get("enable_gui_actions",False):return {"error":"GUI actions disabled in config"}
    if os.name!="nt":return {"error":"Windows only"}
    if a.action=="click":
        if a.x is None or a.y is None or not 0<=a.x<=32767 or not 0<=a.y<=32767:return {"error":"Valid --x and --y required"}
        u=ctypes.windll.user32
        u.SetCursorPos(a.x,a.y)
        u.mouse_event(0x0002,0,0,0,0);u.mouse_event(0x0004,0,0,0,0)
        return {"clicked":[a.x,a.y]}
    return {"error":"Unsupported GUI action"}
def main():
    p=argparse.ArgumentParser()
    p.add_argument("action",choices=["status","windows","clipboard","screenshot","adb","projects","project-files","click"])
    p.add_argument("--path");p.add_argument("--x",type=int);p.add_argument("--y",type=int)
    a=p.parse_args()
    if a.action=="status":result={"python":sys.version.split()[0],"platform":sys.platform,"pillow":importlib.util.find_spec("PIL") is not None,"adb":shutil.which("adb"),"gui_enabled":config().get("enable_gui_actions",False),"roots":roots()}
    elif a.action=="windows":result=windows()
    elif a.action=="clipboard":result=clipboard()
    elif a.action=="screenshot":result=screenshot()
    elif a.action=="adb":result=run(["adb","devices","-l"]) if shutil.which("adb") else {"error":"adb not found"}
    elif a.action=="projects":result=project_list()
    elif a.action=="project-files":result=project_files(a.path) if a.path else {"error":"--path required"}
    else:result=gui_action(a)
    audit(a.action,"error" not in result if isinstance(result,dict) else True)
    emit(result)
if __name__=="__main__":main()
