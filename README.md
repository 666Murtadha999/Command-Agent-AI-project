# Command Agent

A local-first **AI Command Agent** MVP — a dark, command-center web app for a
single power-user (you). The agent maintains long-running context, breaks
requests into plans, classifies risk, and **requires explicit approval** before
any high-impact action runs. The LLM provider is mocked by default so the app
is fully usable without any API keys; a clean adapter interface lets you plug
in a real model later.

Built per `/home/user/workspace/ai_command_agent_spec.md`.

---

## Quick start

```bash
cd command-agent
npm install
npm run dev
```

Then open <http://localhost:5000>.

The dev server runs **Express + Vite on the same port** with hot reload.

### Production

```bash
npm run build
npm start          # node dist/index.cjs, port 5000
```

### Data

All state lives in a local SQLite file at `./data.db` (plus the `-shm` / `-wal`
sidecars). To **reset the agent**, stop the server and delete the file:

```bash
rm data.db data.db-shm data.db-wal
```

Tables are recreated automatically on next start.

---

## What you get

The MVP implements every contract item from the spec:

| Spec item                                     | Where it lives                                   |
| --------------------------------------------- | ------------------------------------------------ |
| Behavior contract / core system prompt        | `server/agent/prompts.ts`                        |
| Think / Draft / Prepare / Execute modes       | `server/agent/policy.ts`, `provider.ts`          |
| Chat with visible mode + status               | `client/src/pages/chat.tsx`                      |
| Task panel (pending / in_progress / blocked / completed) | `client/src/pages/chat.tsx` right panel |
| Research / coding / writing / studying / org mocks | `server/agent/provider.ts` (`MockProvider`)  |
| Real web search for research requests              | `server/agent/search.ts`                     |
| Memory CRUD with 6 categories                 | `client/src/pages/memory.tsx`                    |
| Approval request lifecycle                    | `server/agent/orchestrator.ts`                   |
| Approval modal (summary / payload / target / effect / reversibility / risks) | `client/src/components/approval-modal.tsx` |
| Risk classification low / medium / high / critical | `server/agent/policy.ts`                    |
| Tool registry                                 | `server/agent/policy.ts` → `TOOL_REGISTRY`       |
| Audit log                                     | `client/src/pages/audit.tsx`                     |
| Settings (provider placeholder)               | `client/src/pages/settings.tsx`                  |

Plus a safety module (`server/agent/safety.ts`) that refuses operational-harm
asks while explicitly allowing benign discussion (education, de-escalation,
self-defense, research, analysis). Eleven regression tests guard the behavior.

---

## File map

```
command-agent/
├── README.md                              ← you are here
├── package.json
├── data.db                                ← created on first run
├── shared/
│   └── schema.ts                          ← Drizzle schema + Zod insert schemas
├── server/
│   ├── index.ts                           ← Express + Vite bootstrap
│   ├── routes.ts                          ← REST API
│   ├── storage.ts                         ← DatabaseStorage (better-sqlite3)
│   ├── vite.ts / static.ts                ← dev + prod static serving
│   └── agent/
│       ├── prompts.ts                     ← CORE_SYSTEM_PROMPT (the contract)
│       ├── policy.ts                      ← classify(), TOOL_REGISTRY
│       ├── provider.ts                    ← LLMProvider + MockProvider
│       ├── orchestrator.ts                ← turn handler + executeApproved
│       ├── search.ts                      ← server-side web search providers
│       ├── safety.ts                      ← operational-harm refusal policy
│       └── safety.test.ts                 ← 11 regression tests
└── client/
    ├── index.html
    └── src/
        ├── main.tsx                       ← forces dark mode on load
        ├── index.css                      ← dark command-center theme tokens
        ├── App.tsx                        ← wouter hash router
        ├── components/
        │   ├── app-shell.tsx              ← sidebar + conversation list
        │   ├── approval-modal.tsx
        │   ├── markdown-lite.tsx
        │   ├── logo.tsx
        │   └── ui/                        ← shadcn
        └── pages/
            ├── chat.tsx                   ← three-pane chat + plan + tools
            ├── memory.tsx                 ← 6-category CRUD
            ├── approvals.tsx              ← pending / approved / denied
            ├── audit.tsx                  ← newest-first event log
            ├── tools.tsx                  ← tool registry view
            ├── settings.tsx               ← provider + policy controls
            └── not-found.tsx
```

---

## How the agent loop works

```
user message
     │
     ▼
orchestrator.handleUserTurn()
 1. persist user message
 2. safety.classifyHarm()  ─── operational-harm? → refuse, log, return
 3. policy.classify()       ─── mode + risk + approvalRequired?
 4. write any new auto-memory
 5. if approvalRequired → create ApprovalRequest, override reply
 6. if research-like → search.webSearch() returns cited web results
 7. else → provider.generate() → MockProvider produces a mode-specific reply
 7. persist assistant message + audit event
 8. if reply mentions "plan/steps" → derive Task rows for the right panel
```

Approval gate (Execute mode):

```
POST /api/approvals/:id/decision  { decision: "approve" | "deny" }
     │
     ▼
orchestrator.executeApproved()
  records a ToolCall row (status: "succeeded" — SIMULATED)
  writes a tool-role message back to the conversation
  emits an audit event
```

Execution is **simulated only** in the MVP. No real side effects. Hooking
this up to real tools means filling in the body of `executeApproved` and
the relevant entries in `TOOL_REGISTRY`.

---

## Web search / internet access

Research-like chat requests now call a real server-side search tool before the
mock provider. The default provider is DuckDuckGo Instant Answer, which needs no
API key but returns limited results.

For better web search, set one of these before starting the app:

```bash
# Tavily
export SEARCH_PROVIDER=tavily
export TAVILY_API_KEY=tvly-...
npm run dev

# Brave Search
export SEARCH_PROVIDER=brave
export BRAVE_SEARCH_API_KEY=...
npm run dev
```

Manual test endpoint:

```bash
curl -X POST http://localhost:5000/api/tools/web-search \
  -H 'content-type: application/json' \
  -d '{"query":"SQLite vs Postgres local-first app","limit":5}'
```

Frontend API keys are never used. Search runs only on the backend.

---

## Local AI with Ollama

Ollama is supported out of the box. Install Ollama, pull a model, then start the
app with `AGENT_PROVIDER=ollama`.

Install:

1. Download Ollama from <https://ollama.com/download>.
2. Open a new terminal.
3. Pull a model:

```bash
ollama pull llama3.2
```

Windows CMD run command:

```bat
set AGENT_PROVIDER=ollama&& set OLLAMA_MODEL=llama3.2&& set NODE_ENV=development&& npx tsx server/index.ts
```

PowerShell run command:

```powershell
$env:AGENT_PROVIDER="ollama"; $env:OLLAMA_MODEL="llama3.2"; $env:NODE_ENV="development"; npx tsx server/index.ts
```

Mac/Linux run command:

```bash
AGENT_PROVIDER=ollama OLLAMA_MODEL=llama3.2 npm run dev
```

Optional environment variables:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
OLLAMA_TEMPERATURE=0.4
```

If the app says the model is missing, run `ollama pull <model-name>`.

---

## Extending with another real LLM

The provider is the only place that needs to change.

1. Open `server/agent/provider.ts`. The interface is:

   ```ts
   export interface LLMProvider {
     readonly name: string;
     readonly model: string;
     complete(req: ProviderRequest): Promise<ProviderResponse>;
   }
   ```

2. Add a new class, e.g. `OpenAIProvider implements LLMProvider`. Use
   `req.system` (already includes memories and the core contract),
   `req.messages`, and `req.mode` to produce a reply. Return
   `{ content, provider, model }`.

3. Register it in `getProvider()`:

   ```ts
   case "openai":
     cached = new OpenAIProvider(process.env.OPENAI_API_KEY!);
     break;
   ```

4. Set the env var:

   ```bash
   export AGENT_PROVIDER=openai
   export OPENAI_API_KEY=sk-...
   npm run dev
   ```

5. The settings page already exposes a provider dropdown — wire the new
   option into `client/src/pages/settings.tsx` if you want it selectable
   at runtime.

`MockProvider` stays as the offline default so the app keeps working with
no keys.

---

## API surface

All routes are JSON over HTTP.

| Method | Path                                | Purpose                                       |
| ------ | ----------------------------------- | --------------------------------------------- |
| GET    | `/api/conversations`                | List conversations (newest first)             |
| POST   | `/api/conversations`                | Create a new conversation                     |
| GET    | `/api/conversations/:id/messages`   | Messages for a conversation                   |
| POST   | `/api/chat`                         | Send a user message → assistant reply         |
| GET    | `/api/tasks?conversationId=…`       | Tasks for the active plan                     |
| PATCH  | `/api/tasks/:id`                    | Update task status                            |
| GET    | `/api/memory`                       | List all memory items                         |
| POST   | `/api/memory`                       | Create a memory                               |
| PATCH  | `/api/memory/:id`                   | Edit / toggle a memory                        |
| DELETE | `/api/memory/:id`                   | Delete a memory                               |
| GET    | `/api/approvals`                    | List approval requests                        |
| POST   | `/api/approvals/:id/decision`       | `{ decision: "approve" \| "deny" }`           |
| GET    | `/api/audit`                        | Audit event log                               |
| GET    | `/api/tools`                        | Tool registry                                 |
| POST   | `/api/tools/web-search`             | Server-side web search                        |
| GET    | `/api/tool-calls`                   | Tool-call history                             |
| GET    | `/api/settings` / PUT               | Read / write settings                         |

---

## Tests

```bash
npx tsx server/agent/safety.test.ts
```

Eleven regression tests cover the safety policy: benign discussion of
sensitive topics is **allowed** (de-escalation guidance, self-defense
research, philosophical analysis, etc.); operational-harm requests are
refused with the canonical refusal text.

Type check:

```bash
npx tsc --noEmit
```

---

## Design notes

- **Dark-first command-center aesthetic.** Cool near-black surfaces
  (`220 14% 6–14%`), cyan primary (`185 90% 55%`), amber accent
  (`38 92% 60%`) reserved for pending approvals only, destructive red for
  irreversible actions. JetBrains Mono for code/payloads, Inter for body.
  A faint grid texture sits behind `body::before` to evoke a control plane
  without becoming noise.
- **Approval gate is server-enforced.** The frontend cannot bypass it; the
  orchestrator refuses to call a tool until the matching `ApprovalRequest`
  row flips to `approved`.
- **Memory is opt-in and editable.** Six categories
  (`identity`, `preferences`, `projects`, `commitments`, `style`, `secrets`).
  Every memory is editable, deletable, and toggleable from the Memory page.
- **No real LLM by default.** `MockProvider` is deterministic and produces
  mode-shaped replies so the UI exercises every state without API keys.

---

## Follow-up conventions

- New tools → add to `TOOL_REGISTRY` in `server/agent/policy.ts` with a
  risk level and reversibility flag, then handle the call in
  `executeApproved` in `server/agent/orchestrator.ts`.
- New memory categories → extend `memoryCategories` in `shared/schema.ts`
  and the category list in `client/src/pages/memory.tsx`.
- New audit event types → call `storage.recordAudit({ type, … })` from
  wherever the event happens; the Audit page picks them up automatically.
- Schema changes → edit `shared/schema.ts`, then either
  `npm run db:push` or delete `data.db` to let `ensureSchema()` recreate it.

---

## License

MIT — personal-use MVP.
