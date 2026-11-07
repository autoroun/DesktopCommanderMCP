"""Persistent continuation checkpoints for Desktop Commander MCP sessions.

Stores instructions and progress, not a self-running AI or ChatGPT keepalive.
"""
import datetime, json, os, pathlib, sqlite3, threading
from contextlib import contextmanager
DB=pathlib.Path.home()/".pc-agent"/"continuation.sqlite3"
LOCK=threading.RLock()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
@contextmanager
def connection():
 DB.parent.mkdir(parents=True,exist_ok=True)
 con=sqlite3.connect(DB,timeout=10)
 con.execute("CREATE TABLE IF NOT EXISTS continuations (id INTEGER PRIMARY KEY, goal TEXT NOT NULL, status TEXT NOT NULL, next_step TEXT NOT NULL, summary TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL)")
 con.execute("CREATE TABLE IF NOT EXISTS continuation_events (id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL, event TEXT NOT NULL, created TEXT NOT NULL)")
 con.commit()
 try:
  with con:
   yield con
 finally:
  con.close()
def start(goal,next_step):
 if not goal.strip() or len(goal)>4000 or len(next_step)>4000:raise ValueError("Invalid goal or next step")
 with LOCK,connection() as con:
  t=now()
  cur=con.execute("INSERT INTO continuations(goal,status,next_step,summary,created,updated) VALUES(?,?,?,?,?,?)",(goal,"active",next_step,"",t,t))
  con.execute("INSERT INTO continuation_events(task_id,event,created) VALUES(?,?,?)",(cur.lastrowid,"Task created",t))
  return {"task_id":cur.lastrowid,"status":"active"}
def update(task_id,summary,next_step):
 import continuation_mode
 continuation_mode.guard(task_id)
 if len(summary)>8000 or len(next_step)>4000:raise ValueError("Checkpoint too long")
 with LOCK,connection() as con:
  row=con.execute("SELECT status FROM continuations WHERE id=?",(task_id,)).fetchone()
  if not row:raise ValueError("Task not found")
  if row[0]!="active":raise ValueError("Task is not active")
  t=now()
  con.execute("UPDATE continuations SET summary=?,next_step=?,updated=? WHERE id=?",(summary,next_step,t,task_id))
  con.execute("INSERT INTO continuation_events(task_id,event,created) VALUES(?,?,?)",(task_id,summary[:1000],t))
  return {"task_id":task_id,"status":"active","updated":t}
def stop(task_id):
 with LOCK,connection() as con:
  cur=con.execute("UPDATE continuations SET status='stopped',updated=? WHERE id=? AND status='active'",(now(),task_id))
  return {"task_id":task_id,"stopped":bool(cur.rowcount)}
def status(task_id=None):
 with LOCK,connection() as con:
  con.row_factory=sqlite3.Row
  if task_id is None:rows=con.execute("SELECT * FROM continuations ORDER BY updated DESC LIMIT 20")
  else:rows=con.execute("SELECT * FROM continuations WHERE id=?",(task_id,))
  return [dict(x) for x in rows]
def advance(task_id,completed_step,result,next_step):
 """Atomically record completed work and the next planned step."""
 import continuation_mode
 continuation_mode.guard(task_id)
 if not completed_step.strip() or not next_step.strip():raise ValueError("Completed and next steps required")
 if max(len(completed_step),len(result),len(next_step))>4000:raise ValueError("Step too long")
 with LOCK,connection() as con:
  row=con.execute("SELECT status,next_step FROM continuations WHERE id=?",(task_id,)).fetchone()
  if not row:raise ValueError("Task not found")
  if row[0]!="active":raise ValueError("Task stopped")
  if row[1]!=completed_step:raise ValueError("Step mismatch: reload current task before advancing")
  t=now()
  con.execute("UPDATE continuations SET next_step=?,summary=?,updated=? WHERE id=?",(next_step,result,t,task_id))
  con.execute("INSERT INTO continuation_events(task_id,event,created) VALUES(?,?,?)",(task_id,json.dumps({"completed":completed_step,"result":result,"next":next_step},ensure_ascii=False),t))
  return {"task_id":task_id,"completed":completed_step,"next_step":next_step,"updated":t}
