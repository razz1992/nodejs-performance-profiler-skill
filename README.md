# Node.js Performance Profiler Skill — learning project

## Requirements
- Node.js 18 or later (Node.js 20+ recommended).
- No third-party npm packages are required.

## 1. Verify Node.js
```powershell
node --version
npm --version
```

## 2. Run tests
```powershell
npm test
```

## 3. Start the sample server
In terminal A:
```powershell
npm start
```
Leave it running. It binds only to `127.0.0.1:3000`.

## 4. Profile the sample
In terminal B, from this directory:
```powershell
npm run profile
npm run threadpool-check
```

## 5. Stop the server
Press `Ctrl+C` in terminal A.

## What this teaches
- `SKILL.md` is workflow guidance, not executable code.
- `src/server.js` exposes built-in process and event-loop diagnostics.
- `scripts/profile.js` sends a bounded set of local requests.
- `scripts/threadpool-check.js` runs a small async crypto experiment.
- `test/server.test.js` verifies the sample endpoints.

## ChatGPT / custom MCP integration
A custom MCP server exposes tools; it does not automatically load arbitrary skill files. The agent host must separately load the skill text and use it as task instructions, or expose an approved tool that reads the file. For a first manual test, open `SKILL.md`, paste its contents into ChatGPT, and ask it to guide you through the workflow. To automate execution, add narrowly scoped MCP tools for listing/reading project files and running only allowlisted commands. Do not expose an unrestricted shell tool to an agent.

## Safety and interpretation
Measurements from a tiny local sample are for learning only. Do not use them as production capacity estimates. The thread-pool experiment is suggestive, not a direct measurement of queue depth or proof of saturation.
