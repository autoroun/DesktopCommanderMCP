"""Opt-in OpenAI API coding worker. No Claude dependency; no ChatGPT session spoofing."""
import argparse, datetime, json, os, pathlib, subprocess, sys, time
from openai import OpenAI
ROOT=pathlib.Path(__file__).resolve().parents[2]
SCOPE=(ROOT/"extensions"/"pc-agent").resolve()
HOME=pathlib.Path.home()/".pc-agent"
STOP=HOME/"openai-agent.stop"
STATE=HOME/"openai-agent-state.json"
LOG=HOME/"openai-agent-events.jsonl"
TOOLS=[
 {"type":"function","name":"list_files","description":"List files in allowed pc-agent folder","parameters":{"type":"object","properties":{},"required":[],"additionalProperties":False}},
 {"type":"function","name":"read_file","description":"Read a UTF-8 source file inside pc-agent folder","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":False}},
 {"type":"function","name":"write_file","description":"Create or replace a UTF-8 source file inside pc-agent folder","parameters":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"],"additionalProperties":False}},
 {"type":"function","name":"run_tests","description":"Run fixed security and MCP regression tests","parameters":{"type":"object","properties":{},"required":[],"additionalProperties":False}}
]
SYSTEM="""You are a careful coding agent improving the open-source DesktopCommanderMCP fork.
Only modify files in extensions/pc-agent. Prefer small incremental changes with tests.
Never modify credentials, secrets, configs, or Git metadata. Never invoke shell or network tools.
Do not create persistent services or auto-push. Before finishing, run_tests.
If you cannot safely improve, explain why and finish."""
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def record(event,**kw):
 HOME.mkdir(exist_ok=True)
 with LOG.open("a",encoding="utf-8") as f:f.write(json.dumps({"at":utc(),"event":event,**kw},ensure_ascii=False)+"\n")
def state(**kw):
 HOME.mkdir(exist_ok=True);STATE.write_text(json.dumps({"updated":utc(),**kw},indent=2),encoding="utf-8")
def safe(path):
 p=(SCOPE/pathlib.Path(path)).resolve()
 if p==SCOPE or SCOPE not in p.parents:raise ValueError("Outside allowed scope")
 if p.suffix not in {".py",".md",".txt",".ps1",".json",".yml",".yaml"}:raise ValueError("Extension not allowed")
 if any(x in p.parts for x in (".git","__pycache__")):raise ValueError("Protected directory")
 if p.name in {"config.json","mcp-config.example.json"}:raise ValueError("Config protected")
 return p
def tests():
 result={}
 for name in ("test_security.py","test_mcp.py"):
  try:
   p=subprocess.run([sys.executable,str(SCOPE/name)],cwd=ROOT,capture_output=True,text=True,timeout=90,encoding="utf-8",errors="replace")
   result[name]={"ok":p.returncode==0,"output":(p.stdout+"\n"+p.stderr)[-1800:]}
  except Exception as e:result[name]={"ok":False,"error":str(e)}
 return result
def dispatch(name,args):
 if name=="list_files":return [str(x.relative_to(SCOPE)).replace("\\","/") for x in SCOPE.rglob("*") if x.is_file() and ".git" not in x.parts and "__pycache__" not in x.parts][:100]
 if name=="read_file":
  p=safe(args["path"]);return p.read_text(encoding="utf-8")[:40000]
 if name=="write_file":
  p=safe(args["path"]);content=args["content"]
  if len(content)>80000:raise ValueError("File too large")
  p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content,encoding="utf-8")
  record("write",path=str(p.relative_to(SCOPE)))
  return {"written":str(p.relative_to(SCOPE)),"characters":len(content)}
 if name=="run_tests":return tests()
 raise ValueError("Unknown tool")
def git(*args):
 return subprocess.run(["git","-C",str(ROOT),*args],capture_output=True,text=True,timeout=15)
def cycle(model,max_calls):
 if not os.getenv("OPENAI_API_KEY"):return {"state":"blocked","reason":"OPENAI_API_KEY is not configured"}
 if git("status","--porcelain").stdout.strip():return {"state":"blocked","reason":"Git working tree is not clean"}
 client=OpenAI(timeout=120,max_retries=1)
 inputs=[{"role":"user","content":"Inspect the existing pc-agent module and make one safe, useful improvement with a test. Finish with a concise summary."}]
 for step in range(max_calls):
  if STOP.exists():return {"state":"stopped"}
  response=client.responses.create(model=model,instructions=SYSTEM,input=inputs,tools=TOOLS,store=False)
  inputs+=response.output
  calls=[x for x in response.output if x.type=="function_call"]
  if not calls:
   checks=tests()
   return {"state":"verified" if all(v["ok"] for v in checks.values()) else "tests_failed","summary":response.output_text[-2000:],"tests":checks,"steps":step+1}
  for call in calls:
   try:output=dispatch(call.name,json.loads(call.arguments))
   except Exception as e:output={"error":str(e)}
   inputs.append({"type":"function_call_output","call_id":call.call_id,"output":json.dumps(output,ensure_ascii=False)})
 return {"state":"limit_reached","steps":max_calls,"tests":tests()}
def main():
 p=argparse.ArgumentParser()
 p.add_argument("action",choices=["once","status","stop","clear-stop"])
 p.add_argument("--model",default="gpt-6")
 p.add_argument("--max-calls",type=int,default=12)
 a=p.parse_args()
 if a.action=="stop":HOME.mkdir(exist_ok=True);STOP.touch();record("stop");print("Stop requested");return
 if a.action=="clear-stop":STOP.unlink(missing_ok=True);print("Stop flag cleared");return
 if a.action=="status":
  print(STATE.read_text(encoding="utf-8") if STATE.exists() else '{"state":"not_started"}');return
 if not 1<=a.max_calls<=30:raise ValueError("max-calls 1..30")
 if STOP.exists():print("Stopped; clear-stop to resume");return
 state(state="running",model=a.model)
 try:result=cycle(a.model,a.max_calls)
 except Exception as e:result={"state":"failed","reason":str(e)[:500]}
 state(**result);record("finished",state=result["state"])
 print(json.dumps(result,indent=2,ensure_ascii=False))
if __name__=="__main__":main()
