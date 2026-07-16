// File-backed event store for Motif sessions — the zero-config local backend.
// When SUPABASE_URL is configured, src/supabase_store.js is used instead; both
// expose the same (async-compatible) interface.
//
// Layout:
//   <dataRoot>/
//     token_index.json          # sha256(token) -> internal session id
//     action_log.jsonl          # per-action observability trace (no raw tokens)
//     sessions/
//       <internal-session-id>/
//         manifest.json         # mode, hashed token, timestamps, revision, parent, canonical state
//         events.jsonl          # append-only events
//         artifacts/            # generated HTML etc.; events store references, not blobs
//
// Tokens are bearer capabilities (>=128 bits entropy); only SHA-256 hashes are
// stored. Mutations carry expected_revision and fail with a conflict (including
// the events since that revision) when stale. Node is single-threaded and all
// fs operations here are synchronous, so each mutation is atomic in-process.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const DEFAULT_STATE = () => ({
  brief: null,
  banned_patterns: [],
  pinned_ref_ids: [],
  current_prototype_id: null,
});

export class FileSessionStore {
  constructor(root) {
    this.root = root;
    fs.mkdirSync(path.join(root, "sessions"), { recursive: true });
    this.tokenIndexPath = path.join(root, "token_index.json");
    if (!fs.existsSync(this.tokenIndexPath)) fs.writeFileSync(this.tokenIndexPath, "{}");
  }

  // ----------------------------------------------------------- internals

  #tokenIndex() {
    return JSON.parse(fs.readFileSync(this.tokenIndexPath, "utf8"));
  }

  #saveTokenIndex(index) {
    fs.writeFileSync(this.tokenIndexPath, JSON.stringify(index, null, 2));
  }

  sessionDir(sessionId) {
    return path.join(this.root, "sessions", sessionId);
  }

  #manifestPath(sessionId) {
    return path.join(this.sessionDir(sessionId), "manifest.json");
  }

  #eventsPath(sessionId) {
    return path.join(this.sessionDir(sessionId), "events.jsonl");
  }

  readManifest(sessionId) {
    return JSON.parse(fs.readFileSync(this.#manifestPath(sessionId), "utf8"));
  }

  #writeManifest(sessionId, manifest) {
    fs.writeFileSync(this.#manifestPath(sessionId), JSON.stringify(manifest, null, 2));
  }

  readEvents(sessionId) {
    const p = this.#eventsPath(sessionId);
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  }

  /** Map a raw token to a live internal session id, enforcing expiry. */
  resolve(token) {
    const sessionId = this.#tokenIndex()[hashToken(token)];
    if (!sessionId || !fs.existsSync(this.#manifestPath(sessionId))) throw new SessionNotFound();
    const manifest = this.readManifest(sessionId);
    if (manifest.expires_at && Date.now() > Date.parse(manifest.expires_at)) {
      throw new SessionExpired(manifest.expires_at);
    }
    return sessionId;
  }

  listSessionIds() {
    const dir = path.join(this.root, "sessions");
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(this.#manifestPath(d.name)))
      .map((d) => d.name);
  }

  // ----------------------------------------------------------- lifecycle

  /** Returns { token, manifest }. The raw token is never stored. */
  createSession({ mode, label = null, retentionDays = null, parent = null, state = null }) {
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
      created_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
      expires_at: expires.toISOString().replace(/\.\d{3}Z$/, "Z"),
      revision: 0,
      parent,
      state: state ?? DEFAULT_STATE(),
    };
    fs.mkdirSync(path.join(this.sessionDir(sessionId), "artifacts"), { recursive: true });
    this.#writeManifest(sessionId, manifest);
    fs.writeFileSync(this.#eventsPath(sessionId), "");
    const index = this.#tokenIndex();
    index[hashToken(token)] = sessionId;
    this.#saveTokenIndex(index);
    return { token, manifest };
  }

  deleteSession(token) {
    const sessionId = this.resolve(token);
    fs.rmSync(this.sessionDir(sessionId), { recursive: true, force: true });
    const index = this.#tokenIndex();
    delete index[hashToken(token)];
    this.#saveTokenIndex(index);
  }

  // ----------------------------------------------------------- events

  /**
   * Atomically append an event, bumping the revision.
   * If expectedRevision is given and stale, throws RevisionConflict with a compact
   * diff (type/id/summary of the events since the expected revision).
   * stateUpdate: optional (state, event) => void mutating canonical state.
   */
  appendEvent(token, type, payload, { expectedRevision = null, stateUpdate = null } = {}) {
    const sessionId = this.resolve(token);
    const manifest = this.readManifest(sessionId);
    const current = manifest.revision;
    if (expectedRevision !== null && expectedRevision !== current) {
      const since = this.readEvents(sessionId)
        .filter((e) => e.revision > expectedRevision)
        .map((e) => ({ revision: e.revision, type: e.type, id: e.id, summary: eventSummary(e) }));
      throw new RevisionConflict(current, since);
    }
    const event = {
      id: `evt-${crypto.randomBytes(6).toString("hex")}`,
      type,
      at: nowIso(),
      revision: current + 1,
      payload,
    };
    fs.appendFileSync(this.#eventsPath(sessionId), JSON.stringify(event) + "\n");
    manifest.revision = current + 1;
    if (stateUpdate) stateUpdate(manifest.state, event);
    this.#writeManifest(sessionId, manifest);
    return event;
  }

  saveArtifact(token, name, content) {
    const sessionId = this.resolve(token);
    const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
    fs.writeFileSync(path.join(this.sessionDir(sessionId), "artifacts", safe), content);
    return `artifacts/${safe}`;
  }

  readArtifact(sessionId, name) {
    const base = path.join(this.sessionDir(sessionId), "artifacts");
    const p = path.resolve(base, name);
    if (!p.startsWith(base + path.sep) || !fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  }

  listArtifacts(sessionId) {
    const base = path.join(this.sessionDir(sessionId), "artifacts");
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base).map((name) => ({
      name,
      bytes: fs.statSync(path.join(base, name)).size,
    }));
  }

  // ----------------------------------------------------------- reads

  manifest(token) {
    return this.readManifest(this.resolve(token));
  }

  events(token) {
    return this.readEvents(this.resolve(token));
  }

  /** Compact canonical state, not the whole event history (PRD §7.4). */
  loadContext(token) {
    return this.contextForSession(this.resolve(token));
  }

  contextForSession(sessionId) {
    return buildContext(this.readManifest(sessionId), this.readEvents(sessionId));
  }

  search(token, query, recordTypes, limit) {
    return searchEvents(this.events(token), query, recordTypes, limit);
  }

  stats(token) {
    const sessionId = this.resolve(token);
    let storage = 0;
    const walk = (dir) => {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) walk(p);
        else storage += fs.statSync(p).size;
      }
    };
    walk(this.sessionDir(sessionId));
    return buildStats(this.readManifest(sessionId), this.readEvents(sessionId), storage);
  }

  export(token, fmt) {
    const sessionId = this.resolve(token);
    return buildExport(this.readManifest(sessionId), this.readEvents(sessionId), fmt);
  }

  // ----------------------------------------------------------- observability

  /** Per-action trace (PRD §20): never logs raw tokens or conversation text. */
  logAction(entry) {
    fs.appendFileSync(
      path.join(this.root, "action_log.jsonl"),
      JSON.stringify({ at: nowIso(), ...entry }) + "\n"
    );
  }

  readActionLog(limit = 200) {
    const p = path.join(this.root, "action_log.jsonl");
    if (!fs.existsSync(p)) return [];
    const lines = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
    return lines.slice(-limit).map((l) => JSON.parse(l));
  }
}
