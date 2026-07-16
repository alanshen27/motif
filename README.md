# Motif Action Server

Express server implementing the Action layer from `PLAN.md` (§14–§20): session
persistence, the Inspiration Ledger, feedback and prototype history, forks,
text search, stats, export/delete, and an observability trace — plus a local
debug UI for inspecting all session data.

Storage is pluggable behind one interface (`src/store.js` file backend,
`src/supabase_store.js` Supabase backend). **Supabase is the deployment
backend**; the file store is a zero-config fallback for local hacking.

## Run

```bash
cd server
npm install
npm start          # http://localhost:8787
```

With no configuration this uses local files under `server/data/`. To use
Supabase:

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor
   (tables: `sessions`, `events`, `artifacts`, `action_log`; RLS enabled with
   no policies, so only the service-role key can touch them).
2. Set the environment and start:

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # server-side only; never ship to a client
npm start
```

- **Debug UI:** http://localhost:8787/debug — lists every session (manifest,
  canonical state, event log, artifacts) and the action log. Local debugging
  only; it has no auth. Disable with `MOTIF_DEBUG_UI=0` before deploying.
- **Port:** override with `PORT`. File-backend data dir: `MOTIF_DATA_DIR`.

## Test

```bash
npm test                        # runs against the file backend (no network)
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm test   # same suite against Supabase
```

Covers lifecycle, token hygiene (raw tokens never persisted), revision
conflicts, ledger dedup, pinning, prototype artifacts, needle-in-haystack
search, forking, provider fallback, and the debug API.

## Wiring the Custom GPT

Import `openapi.yaml` as the Actions schema and replace the server URL with
your deployment. All endpoints are `POST` with JSON bodies.

Key behaviors the GPT relies on:

- `start_session` returns a `mtk_…` bearer token (256-bit). Only its SHA-256
  hash is stored; show it to the user once.
- Mutations carry `expected_revision`; a stale write returns **409** with
  `current_revision` and the events since the expected revision, so the GPT
  can merge, retry, or fork.
- `search_for_inspo` returns `available: false` with fallback guidance unless a
  provider is registered (`src/inspo_provider.js`, `MOTIF_INSPO_PROVIDER`).
  ChatGPT built-in web search remains the default discovery path.
- `search_session_memory` is exact + tokenized + field-aware text search over
  `events.jsonl` (PRD §16.2), returning excerpts with relevance explanations.

## Storage layout

```text
data/
  token_index.json        # sha256(token) -> session id
  action_log.jsonl        # per-action trace (name, latency, session id — never raw tokens)
  sessions/<id>/
    manifest.json         # mode, token hash, revision, parent, canonical state
    events.jsonl          # append-only event log
    artifacts/            # stored prototype HTML
```

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /actions/start_session` | Create temporary (72h TTL) or persistent (90d default) session |
| `POST /actions/load_session_context` | Compact canonical state for resuming |
| `POST /actions/update_brief` | Persist brief + banned patterns |
| `POST /actions/search_for_inspo` | Optional provider search (stub → fallback guidance) |
| `POST /actions/store_inspo` | Batch ledger persistence with URL/provider/title dedup |
| `POST /actions/pin_inspiration` | Pin stored or new references |
| `POST /actions/store_feedback` | Global or artifact-scoped feedback |
| `POST /actions/store_prototype` | Prototype metadata + HTML artifact |
| `POST /actions/get_past_prototypes` | Compact history (no HTML bodies) |
| `POST /actions/fork_session` | Independent child seeded with parent state |
| `POST /actions/search_session_memory` | Text search over the event log |
| `POST /actions/get_session_stats` | Counts, age, storage |
| `POST /actions/export_session` | Markdown or JSON export |
| `POST /actions/delete_session` | Permanent delete (requires `confirm: true`) |
| `GET /healthz` | Liveness |
| `GET /debug` | Debug UI (sessions list + action log) |
