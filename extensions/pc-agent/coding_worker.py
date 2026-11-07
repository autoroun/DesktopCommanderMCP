"""Bounded, opt-in autonomous coding worker using locally installed Claude Code CLI.
Runs only in configured repository, never bypasses permissions, never auto-pushes.
"""
import argparse, datetime, json, os, pathlib, shutil, subprocess, time
BASE=pathlib.Path.home()/".pc-agent"
STATE=BASE/"coding-agent.json"
STOP=BASE/"coding-agent.stop"
ROOT=pathlib.Path(__file__).resolve().parents[2]
LOG=BASE/"coding-agent.log"
PROMPT="""You are working on the open-source DesktopCommanderMCP fork. Make ONE small, valuable improvement to extensions/pc-agent, preferably with a regression test. Do not edit files outside extensions/pc-agent. Do not modify credentials, settings, or system files. Do not run git push, git reset, or destructive commands. Avoid changing running Desktop Commander. Run relevant tests and report changed files, tests, and limitations. Do not create a background process. If there is nothing safe to improve, explain why and exit."""
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def write_log(event,**kwargs):
    BASE.mkdir(exist_ok=True)
    with LOG.open("a",encoding="utf-8") as f:f.write(json.dumps({"utc":stamp(),"event":event,**kwargs},ensure_ascii=False)+"\n")
def save(data):
    BASE.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(data,indent=2),encoding="utf-8")
def status():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError,ValueError):return {"state":"not_started"}
def git(*args):
    return subprocess.run(["git","-C",str(ROOT),*args],capture_output=True,text=True,timeout=20)
def verify():
    results={}
    for name,script in (("security","test_security.py"),("mcp","test_mcp.py")):
        try:
            r=subprocess.run([shutil.which("python") or "python",str(ROOT/"extensions"/"pc-agent"/script)],cwd=ROOT,capture_output=True,text=True,timeout=90,encoding="utf-8",errors="replace")
            results[name]={"passed":r.returncode==0,"output":(r.stdout+"\n"+r.stderr)[-1500:]}
        except Exception as exc:results[name]={"passed":False,"error":str(exc)}
    return results
def cycle(max_budget):
    if STOP.exists():return {"state":"stopped"}
    if not shutil.which("claude"):return {"state":"failed","reason":"Claude Code CLI missing"}
    if git("status","--porcelain").stdout.strip():return {"state":"blocked","reason":"Working tree not clean"}
    before=git("rev-parse","HEAD").stdout.strip()
    command=["claude","-p",PROMPT,"--permission-mode","acceptEdits","--allowedTools","Read,Edit,Write,Glob,Grep,Bash(python *),Bash(git diff *),Bash(git status *)","--max-budget-usd",str(max_budget),"--no-session-persistence"]
    try:
        p=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=480,encoding="utf-8",errors="replace")
    except subprocess.TimeoutExpired:return {"state":"failed","reason":"Claude timed out"}
    changed=git("status","--porcelain").stdout.strip().splitlines()
    # Enforce repository scope after execution; refuse further cycles on unexpected changes.
    unexpected=[line for line in changed if not line[3:].replace("\\","/").startswith("extensions/pc-agent/")]
    if unexpected:return {"state":"blocked","reason":"Unexpected files changed","files":unexpected}
    if not changed:return {"state":"no_changes" if p.returncode==0 else "failed","exit_code":p.returncode,"summary":(p.stdout+"\\n"+p.stderr)[-1200:]}
    checks=verify()
    passed=all(v["passed"] for v in checks.values())
    return {"state":"verified" if passed else "tests_failed","exit_code":p.returncode,"files":changed,"tests":checks,"summary":p.stdout[-1500:],"base_commit":before}
def main():
    p=argparse.ArgumentParser()
    p.add_argument("action",choices=["start","once","status","stop","clear-stop"])
    p.add_argument("--cycles",type=int,default=1)
    p.add_argument("--budget",type=float,default=0.5)
    a=p.parse_args()
    if a.action=="status":print(json.dumps(status(),indent=2));return
    if a.action=="stop":
        BASE.mkdir(exist_ok=True);STOP.touch();write_log("stop_requested");print("Stop requested; current bounded CLI call may finish first");return
    if a.action=="clear-stop":
        STOP.unlink(missing_ok=True);print("Stop flag cleared");return
    if not 1<=a.cycles<=20 or not 0.05<=a.budget<=2:raise ValueError("cycles 1..20; budget 0.05..2 USD")
    if STOP.exists():print("Stopped. Use clear-stop first.");return
    for i in range(a.cycles if a.action=="start" else 1):
        if STOP.exists():break
        save({"state":"running","cycle":i+1,"updated":stamp()})
        result=cycle(a.budget)
        result["cycle"]=i+1;result["updated"]=stamp()
        save(result);write_log("cycle_complete",state=result["state"],cycle=i+1)
        print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
        # Stop after any code change for human review; do not automatically stack edits.
        if result["state"]!="no_changes":break
        time.sleep(5)
if __name__=="__main__":main()
