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

`npm start` loads `server/.env` automatically if present (Node `--env-file-if-exists`).

- **Debug UI:** http://localhost:8787/debug — lists every session (manifest,
  canonical state, event log, artifacts) and the action log. Local debugging
  only; it has no auth. Disable with `MOTIF_DEBUG_UI=0` before deploying.
- **Port:** override with `PORT`. File-backend data dir: `MOTIF_DATA_DIR`.

## Deploy (Vercel)

The repo is Vercel-ready: `api/index.js` exports the Express app as a
serverless handler and `vercel.json` rewrites every route to it.

1. `vercel` (or import the repo in the Vercel dashboard; root = this folder).
2. Set env vars in the project settings: `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (the long `service_role` JWT from
   Supabase → Settings → API — **not** a URL). Optionally
   `MOTIF_INSPO_PROVIDER` and provider credentials.
3. Without Supabase env the deployment still boots, but falls back to an
   **ephemeral** file store in `/tmp` (fine for demos; sessions vanish on
   cold starts).

The debug UI is disabled by default on Vercel (`MOTIF_DEBUG_UI` defaults to
`0` in the serverless entry); it lists all sessions without auth, so leave it
off in public deployments.

## Inspiration provider (optional)

`POST /actions/search_for_inspo` is a secondary search path; ChatGPT built-in
web search remains the default. Select a provider with
`MOTIF_INSPO_PROVIDER`; unset (or on any provider failure) the Action returns
`available: false` with fallback guidance instead of an error.

**`MOTIF_INSPO_PROVIDER=arena`** — Are.na adapter (community-curated design
boards; sanctioned API). Anonymous mode searches a small allowlist of public
design channels (override with `ARENA_CHANNELS` or per-request
`source_filters`); setting `ARENA_ACCESS_TOKEN` (premium) upgrades to Are.na's
real v3 full-text search. Best for mood/editorial/typography references, not
UI-shot galleries.

**`MOTIF_INSPO_PROVIDER=dribbble`** — compliant Dribbble adapter. Dribbble's
v2 API has no public search and its terms prohibit scraping, so this searches
the *authenticated user's own shots* via OAuth. Set `DRIBBBLE_ACCESS_TOKEN`
(create an app at https://dribbble.com/account/applications). Results are
normalized source-linked references; image bytes are never stored.

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

## Storage model

Both backends implement the same event-sourced model: a session row/manifest
holding the revision counter and compact canonical state (brief, banned
patterns, pinned ref IDs, current prototype), an append-only event log, and an
artifacts area for prototype HTML. Mutations claim `revision + 1` atomically —
in Supabase via a conditional `UPDATE … WHERE revision = current` plus a
`(session_id, revision)` primary key on `events`; on disk via synchronous
writes in a single process. Raw bearer tokens are never persisted, only their
SHA-256 hashes.

```text
Supabase                          Files (local dev)
--------                          -----------------
sessions   (1 row per session)    data/sessions/<id>/manifest.json
events     (PK session, revision) data/sessions/<id>/events.jsonl
artifacts  (HTML as text rows)    data/sessions/<id>/artifacts/
action_log                        data/action_log.jsonl
                                  data/token_index.json
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
