"""Persistent, explicitly controlled local job queue; no ChatGPT session manipulation."""
import argparse, datetime, json, os, pathlib, sqlite3, subprocess, sys, time
BASE=pathlib.Path.home()/".pc-agent"
DB=BASE/"jobs.sqlite"
def connect():
    BASE.mkdir(exist_ok=True)
    db=sqlite3.connect(DB,timeout=15)
    db.execute("CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, command TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', created_utc TEXT NOT NULL, updated_utc TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, exit_code INTEGER, output TEXT)")
    db.commit()
    return db
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
# Fixed commands only: no arbitrary shell or automatic code writing.
COMMANDS={
    "security-tests":[sys.executable,str(pathlib.Path(__file__).with_name("test_security.py"))],
    "mcp-tests":[sys.executable,str(pathlib.Path(__file__).with_name("test_mcp.py"))],
    "syntax-check":[sys.executable,"-m","py_compile",str(pathlib.Path(__file__).with_name("mcp_server.py"))]
}
def add(title,kind):
    if kind not in COMMANDS:raise ValueError("Unsupported job type")
    with connect() as db:
        cur=db.execute("INSERT INTO jobs(title,command,state,created_utc,updated_utc) VALUES(?,?,?,?,?)",(title,kind,"queued",now(),now()))
        return {"job_id":cur.lastrowid,"state":"queued"}
def status():
    with connect() as db:
        db.row_factory=sqlite3.Row
        return [dict(x) for x in db.execute("SELECT id,title,command,state,attempts,exit_code,updated_utc,substr(output,1,1000) AS output FROM jobs ORDER BY id DESC LIMIT 30")]
def stop(job_id):
    with connect() as db:
        r=db.execute("UPDATE jobs SET state='stopped',updated_utc=? WHERE id=? AND state='queued'",(now(),job_id))
        return {"stopped":bool(r.rowcount),"note":"Running jobs finish their current bounded command; no forced process termination"}
def tick():
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT id,command FROM jobs WHERE state='queued' ORDER BY id LIMIT 1").fetchone()
        if not row:return {"state":"idle"}
        job_id,kind=row
        db.execute("UPDATE jobs SET state='running',attempts=attempts+1,updated_utc=? WHERE id=?",(now(),job_id))
        db.commit()
    try:
        proc=subprocess.run(COMMANDS[kind],capture_output=True,text=True,timeout=45,encoding="utf-8",errors="replace",env={**os.environ,"PC_AGENT_JOB":"1"})
        code=proc.returncode
        out=(proc.stdout+"\n"+proc.stderr)[-8000:]
    except Exception as exc:
        code=-1;out=str(exc)
    with connect() as db:
        db.execute("UPDATE jobs SET state=?,exit_code=?,output=?,updated_utc=? WHERE id=?",("passed" if code==0 else "failed",code,out,now(),job_id))
    return {"job_id":job_id,"state":"passed" if code==0 else "failed","exit_code":code}
def main():
    p=argparse.ArgumentParser()
    p.add_argument("action",choices=["add","status","stop","tick","worker"])
    p.add_argument("--title",default="Verification");p.add_argument("--kind",choices=sorted(COMMANDS))
    p.add_argument("--id",type=int);p.add_argument("--interval",type=int,default=15)
    a=p.parse_args()
    if a.action=="add":result=add(a.title,a.kind)
    elif a.action=="status":result=status()
    elif a.action=="stop":result=stop(a.id)
    elif a.action=="tick":result=tick()
    else:
        if not 5<=a.interval<=3600:raise ValueError("Interval 5..3600")
        print("Worker started; Ctrl+C to stop. No autonomous code changes.",flush=True)
        while True:
            print(json.dumps(tick()),flush=True)
            time.sleep(a.interval)
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
