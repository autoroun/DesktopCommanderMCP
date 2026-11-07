"""Continuation mode controls; persistence only, no autonomous ChatGPT execution."""
import datetime
import continuation as base
UTC=datetime.timezone.utc
MAX_MINUTES=24*60
def parse_deadline(minutes=None,until_utc=None):
 if (minutes is None)==(until_utc is None):raise ValueError("Supply either minutes or until_utc")
 now=datetime.datetime.now(UTC)
 if minutes is not None:
  if not isinstance(minutes,int) or not 1<=minutes<=MAX_MINUTES:raise ValueError("Duration must be 1..1440 minutes")
  return (now+datetime.timedelta(minutes=minutes)).isoformat()
 try:dt=datetime.datetime.fromisoformat(until_utc.replace("Z","+00:00"))
 except (ValueError,AttributeError):raise ValueError("Use ISO 8601 with timezone")
 if dt.tzinfo is None:raise ValueError("Timezone required")
 if not now<dt.astimezone(UTC)<=now+datetime.timedelta(minutes=MAX_MINUTES):raise ValueError("Deadline must be within next 24 hours")
 return dt.astimezone(UTC).isoformat()
def init(con):
 con.execute("CREATE TABLE IF NOT EXISTS continuation_modes (task_id INTEGER PRIMARY KEY, mode TEXT NOT NULL, deadline TEXT, updated TEXT NOT NULL)")
def effective(con,task_id):
 init(con)
 row=con.execute("SELECT status FROM continuations WHERE id=?",(task_id,)).fetchone()
 if not row:raise ValueError("Task not found")
 m=con.execute("SELECT mode,deadline FROM continuation_modes WHERE task_id=?",(task_id,)).fetchone()
 mode,deadline=m if m else ("manual",None)
 if row[0]!="active":return {"task_id":task_id,"mode":"stopped","deadline":deadline}
 if deadline and datetime.datetime.now(UTC)>=datetime.datetime.fromisoformat(deadline):
  con.execute("UPDATE continuations SET status='stopped',updated=? WHERE id=?",(base.now(),task_id))
  con.execute("UPDATE continuation_modes SET mode='stopped',updated=? WHERE task_id=?",(base.now(),task_id))
  return {"task_id":task_id,"mode":"stopped","deadline":deadline,"reason":"deadline_reached"}
 return {"task_id":task_id,"mode":mode,"deadline":deadline}
def set_mode(task_id,mode,minutes=None,until_utc=None):
 if mode not in ("continuous","timed","manual","stopped"):raise ValueError("Invalid mode")
 if mode=="timed":deadline=parse_deadline(minutes,until_utc)
 else:
  if minutes is not None or until_utc is not None:raise ValueError("Deadline only for timed mode")
  deadline=None
 with base.LOCK,base.connection() as con:
  current=effective(con,task_id)
  if current["mode"]=="stopped" and mode!="stopped":raise ValueError("Stopped task cannot be restarted")
  if mode=="stopped":
   con.execute("UPDATE continuations SET status='stopped',updated=? WHERE id=?",(base.now(),task_id))
  con.execute("INSERT INTO continuation_modes(task_id,mode,deadline,updated) VALUES(?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET mode=excluded.mode,deadline=excluded.deadline,updated=excluded.updated",(task_id,mode,deadline,base.now()))
  return effective(con,task_id)
def get_mode(task_id):
 with base.LOCK,base.connection() as con:return effective(con,task_id)
def guard(task_id):
 m=get_mode(task_id)
 if m["mode"]=="stopped":raise ValueError("Continuation stopped or deadline reached")
 return m
