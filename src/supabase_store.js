// Supabase (Postgres) storage backend. Same interface as FileSessionStore but
// async; used when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
//
// Schema: supabase/schema.sql — sessions (one row per session; revision +
// canonical state), events (append-only, PK (session_id, revision)), artifacts
// (prototype HTML as text rows), action_log.
//
// Concurrency: appendEvent claims the next revision with a conditional UPDATE
// (`WHERE revision = current`); zero rows updated means another writer won, so
// we re-read and either retry (no expected_revision) or raise the conflict.
// The PK on (session_id, revision) additionally guarantees the event log can
// never contain two events for the same revision.

import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  buildContext,
  buildExport,
  buildStats,
  eventSummary,
  searchEvents,
} from "./context.js";
import { RevisionConflict, SessionExpired, SessionNotFound, hashToken, newToken } from "./errors.js";

const DEFAULT_TEMP_TTL_HOURS = 72;
const DEFAULT_PERSISTENT_RETENTION_DAYS = 90;

const nowIso = () => new Date().toISOString();

const DEFAULT_STATE = () => ({
  brief: null,
  banned_patterns: [],
  pinned_ref_ids: [],
  current_prototype_id: null,
});

function must({ data, error }) {
  if (error) throw new Error(`supabase: ${error.message}`);
  return data;
}

export class SupabaseSessionStore {
  constructor({ url, serviceRoleKey }) {
    this.sb = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // ----------------------------------------------------------- reads

  async readManifest(sessionId) {
    const rows = must(
      await this.sb.from("sessions").select("*").eq("session_id", sessionId).limit(1)
    );
    if (!rows.length) throw new SessionNotFound();
    return rows[0];
  }

  async readEvents(sessionId) {
    return must(
      await this.sb
        .from("events")
        .select("id, type, at, revision, payload")
        .eq("session_id", sessionId)
        .order("revision", { ascending: true })
    );
  }

  /** Map a raw token to a live session id, enforcing expiry. */
  async resolve(token) {
    const rows = must(
      await this.sb
        .from("sessions")
        .select("session_id, expires_at")
        .eq("token_hash", hashToken(token))
        .limit(1)
    );
    if (!rows.length) throw new SessionNotFound();
    const { session_id, expires_at } = rows[0];
    if (expires_at && Date.now() > Date.parse(expires_at)) throw new SessionExpired(expires_at);
    return session_id;
  }

  async listSessionIds() {
    const rows = must(
      await this.sb.from("sessions").select("session_id").order("created_at", { ascending: false })
    );
    return rows.map((r) => r.session_id);
  }

  // ----------------------------------------------------------- lifecycle

  /** Returns { token, manifest }. The raw token is never stored. */
  async createSession({ mode, label = null, retentionDays = null, parent = null, state = null }) {
    const token = newToken();
    const sessionId = crypto.randomUUID().replaceAll("-", "");
    const now = new Date();
    const expires = new Date(
      mode === "temporary"
        ? now.getTime() + DEFAULT_TEMP_TTL_HOURS * 3600_000
        : now.getTime() + (retentionDays ?? DEFAULT_PERSISTENT_RETENTION_DAYS) * 86400_000
    );
    const manifest = {
      session_id: sessionId,
      mode,
      token_hash: hashToken(token),
      label,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
      revision: 0,
      parent,
      state: state ?? DEFAULT_STATE(),
    };
    must(await this.sb.from("sessions").insert(manifest).select("session_id"));
    return { token, manifest };
  }

  async deleteSession(token) {
    const sessionId = await this.resolve(token);
    // events/artifacts cascade from the sessions FK.
    must(await this.sb.from("sessions").delete().eq("session_id", sessionId).select("session_id"));
  }

  // ----------------------------------------------------------- events

  async appendEvent(token, type, payload, { expectedRevision = null, stateUpdate = null } = {}) {
    const sessionId = await this.resolve(token);
    for (let attempt = 0; attempt < 5; attempt++) {
      const manifest = await this.readManifest(sessionId);
      const current = manifest.revision;
      if (expectedRevision !== null && expectedRevision !== current) {
        throw new RevisionConflict(current, await this.#eventsSince(sessionId, expectedRevision));
      }
      const event = {
        id: `evt-${crypto.randomBytes(6).toString("hex")}`,
        type,
        at: nowIso(),
        revision: current + 1,
        payload,
      };
      const state = structuredClone(manifest.state);
      if (stateUpdate) stateUpdate(state, event);

      // Claim the next revision; zero updated rows means we lost a race.
      const claimed = must(
        await this.sb
          .from("sessions")
          .update({ revision: current + 1, state })
          .eq("session_id", sessionId)
          .eq("revision", current)
          .select("session_id")
      );
      if (!claimed.length) {
        if (expectedRevision !== null) {
          const fresh = await this.readManifest(sessionId);
          throw new RevisionConflict(
            fresh.revision,
            await this.#eventsSince(sessionId, expectedRevision)
          );
        }
        continue;
      }
      must(await this.sb.from("events").insert({ session_id: sessionId, ...event }).select("id"));
      return event;
    }
    throw new Error("could not append event after repeated revision races");
  }

  async #eventsSince(sessionId, revision) {
    const rows = must(
      await this.sb
        .from("events")
        .select("id, type, revision, payload")
        .eq("session_id", sessionId)
        .gt("revision", revision)
        .order("revision", { ascending: true })
    );
    return rows.map((e) => ({
      revision: e.revision,
      type: e.type,
      id: e.id,
      summary: eventSummary(e),
    }));
  }

  // ----------------------------------------------------------- artifacts

  async saveArtifact(token, name, content) {
    const sessionId = await this.resolve(token);
    const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
    must(
      await this.sb
        .from("artifacts")
        .upsert({
          session_id: sessionId,
          name: safe,
          content,
          bytes: Buffer.byteLength(content),
        })
        .select("name")
    );
    return `artifacts/${safe}`;
  }

  async readArtifact(sessionId, name) {
    const rows = must(
      await this.sb
        .from("artifacts")
        .select("content")
        .eq("session_id", sessionId)
        .eq("name", name)
        .limit(1)
    );
    return rows.length ? rows[0].content : null;
  }

  async listArtifacts(sessionId) {
    return must(
      await this.sb.from("artifacts").select("name, bytes").eq("session_id", sessionId)
    );
  }

  // ----------------------------------------------------------- derived reads

  async manifest(token) {
    return this.readManifest(await this.resolve(token));
  }

  async events(token) {
    return this.readEvents(await this.resolve(token));
  }

  async loadContext(token) {
    return this.contextForSession(await this.resolve(token));
  }

  async contextForSession(sessionId) {
    return buildContext(await this.readManifest(sessionId), await this.readEvents(sessionId));
  }

  async search(token, query, recordTypes, limit) {
    return searchEvents(await this.events(token), query, recordTypes, limit);
  }

  async stats(token) {
    const sessionId = await this.resolve(token);
    const [manifest, events, artifacts] = await Promise.all([
      this.readManifest(sessionId),
      this.readEvents(sessionId),
      this.listArtifacts(sessionId),
    ]);
    const storage =
      artifacts.reduce((n, a) => n + a.bytes, 0) +
      Buffer.byteLength(JSON.stringify(events)) +
      Buffer.byteLength(JSON.stringify(manifest));
    return buildStats(manifest, events, storage);
  }

  async export(token, fmt) {
    const sessionId = await this.resolve(token);
    return buildExport(await this.readManifest(sessionId), await this.readEvents(sessionId), fmt);
  }

  // ----------------------------------------------------------- observability

  /** Per-action trace (PRD §20): never logs raw tokens or conversation text. */
  async logAction(entry) {
    const { error } = await this.sb.from("action_log").insert({
      at: nowIso(),
      action: entry.action,
      session_id: entry.session_id ?? null,
      ok: entry.ok ?? null,
      error: entry.error ?? null,
      latency_ms: entry.latency_ms ?? null,
      provider: entry.provider ?? null,
      result_count: entry.result_count ?? null,
    });
    if (error) console.error("action_log insert failed:", error.message);
  }

  async readActionLog(limit = 200) {
    const rows = must(
      await this.sb
        .from("action_log")
        .select("at, action, session_id, ok, error, latency_ms, provider, result_count")
        .order("at", { ascending: false })
        .limit(limit)
    );
    return rows.reverse();
  }
}
