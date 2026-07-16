-- Motif Action server schema. Run once in the Supabase SQL editor
-- (or: supabase db push). The server uses the service-role key, so RLS is
-- enabled with no policies: the anon key can read nothing.

create table if not exists sessions (
  session_id  text primary key,
  token_hash  text unique not null,          -- sha256 of the bearer token; raw tokens are never stored
  mode        text not null check (mode in ('temporary', 'persistent')),
  label       text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revision    integer not null default 0,
  parent      jsonb,
  state       jsonb not null                 -- canonical state: brief, banned_patterns, pinned_ref_ids, current_prototype_id
);

create table if not exists events (
  session_id  text not null references sessions(session_id) on delete cascade,
  revision    integer not null,
  id          text not null,
  type        text not null,
  at          timestamptz not null default now(),
  payload     jsonb not null,
  primary key (session_id, revision)         -- one event per revision: enforces the append-only log
);

create table if not exists artifacts (
  session_id  text not null references sessions(session_id) on delete cascade,
  name        text not null,
  content     text not null,                 -- prototype HTML etc.
  bytes       integer not null,
  created_at  timestamptz not null default now(),
  primary key (session_id, name)
);

create table if not exists action_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  action        text not null,
  session_id    text,                        -- internal id only; never a raw token
  ok            boolean,
  error         text,
  latency_ms    integer,
  provider      text,
  result_count  integer
);

create index if not exists events_type_idx on events (session_id, type);
create index if not exists action_log_at_idx on action_log (at desc);

-- Lock the tables down: the server connects with the service-role key, which
-- bypasses RLS. With RLS on and no policies, anon/authenticated keys get nothing.
alter table sessions   enable row level security;
alter table events     enable row level security;
alter table artifacts  enable row level security;
alter table action_log enable row level security;
