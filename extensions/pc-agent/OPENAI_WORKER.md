# OpenAI-powered coding worker

This replaces the previous Claude CLI worker. It uses the **OpenAI Responses API**, not Claude, and has no ability to keep a ChatGPT conversation open or reuse a ChatGPT Plus subscription as an API key.

## Requirements
- Python and `pip install -r requirements.txt`
- OpenAI API access, an API key stored **outside Git**, and an API model available to that API account
- By default it requests `gpt-6`. If the API account does not have this model, specify an available model using `--model`. ChatGPT model access does not guarantee API model access.

In PowerShell, set an API key in the current terminal session without putting it in source files:
```powershell
$env:OPENAI_API_KEY = Read-Host "OpenAI API key"
python openai_coding_worker.py once --model gpt-6 --max-calls 12
python openai_coding_worker.py status
python openai_coding_worker.py stop
```

**Security and operation:** The agent can read and write files only in `extensions/pc-agent` through the supplied function tools. No shell tool, no git push, no ChatGPT UI automation. It requires a clean working tree, records state in `%USERPROFILE%\.pc-agent`, stops at a tool-call limit, and runs tests at the end. File changes require human review. The key stays in the local environment; never paste it into chat. OpenAI API calls may incur separate charges.

**Limitation:** This is a single bounded coding run, not an unattended infinite loop. To continue after reviewing the diff, commit the changes and launch another run. The local `stop` flag prevents additional steps when the agent checks it. It cannot cancel an in-flight API request instantly.
