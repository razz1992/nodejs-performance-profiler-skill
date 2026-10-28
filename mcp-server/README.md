# Node.js Profiling MCP Server

This is a separate, dependency-free MCP adapter for the parent sample project. It does not modify the sample application's source or package files.

## Exposed tools

- `read_skill` — read the fixed `SKILL.md`.
- `inspect_environment` — Node version, package scripts, and required-file presence.
- `run_tests` — runs only `node --test test/server.test.js`.
- `run_profile` — starts `src/server.js` on loopback, runs the fixed bounded profile script, then stops the server.
- `run_threadpool_check` — runs the fixed bounded crypto experiment.

No arbitrary paths, shell commands, package installs, source edits, Git commands, or network targets are accepted.

## Requirements

- Node.js 24 or a compatible modern Node.js version.
- No third-party npm packages.

## Start locally (PowerShell)

Set a private bearer token in the current PowerShell session. Do not paste the token into chat or commit it:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$env:PROFILER_MCP_TOKEN = [Convert]::ToBase64String($bytes)
$env:PROFILER_MCP_PORT = "8787"
node .\mcp-server\server.js
```

The endpoint binds only to `127.0.0.1:8787/mcp`. Requests must include `Authorization: Bearer <token>`. Keep the token in the same private environment used by the tunnel/host. Do not expose this port directly to the internet.

## Protocol smoke test

From another PowerShell window, run:

```powershell
node .\mcp-server\smoke-test.js
```

The smoke test starts its own temporary server and checks authentication, initialization, tool discovery, and a read-only tool call.

## ChatGPT web connection

ChatGPT web requires a supported account/workspace and a public HTTPS endpoint or supported Secure MCP Tunnel. Do not use a plain public port-forward. Configure authentication only through the ChatGPT connection UI and keep the bearer token secret. If your account does not offer custom MCP apps, use another MCP client or an eligible ChatGPT plan/workspace.
