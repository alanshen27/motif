import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { ZodError } from "zod";

import * as schemas from "./schemas.js";
import { searchInspoProvider } from "./inspo_provider.js";
import { RevisionConflict, SessionExpired, SessionNotFound } from "./errors.js";
import { FileSessionStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build the Express app. Pass either a store instance (file or Supabase) or a
 * dataRoot for the default file backend. Every store method is awaited, so
 * sync (file) and async (Supabase) backends are interchangeable.
 */
export function createApp({ store, dataRoot }) {
  store ??= new FileSessionStore(dataRoot);
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // ------------------------------------------------------------ helpers

  const newRefId = () => `ref-${crypto.randomBytes(4).toString("hex")}`;
  const newProtoId = () => `proto-${crypto.randomBytes(4).toString("hex")}`;

  /**
   * Wrap an action handler: validate the body, run it, log an observability
   * trace (action, latency, session id — never the raw token), and map domain
   * errors to HTTP responses.
   */
  const action = (name, schema, handler) => async (req, res) => {
    const started = Date.now();
    const trace = { action: name };
    try {
      const body = schema.parse(req.body ?? {});
      if (body.session_token) {
        // Resolve early so every action gets consistent 404/410 handling.
        trace.session_id = await store.resolve(body.session_token);
      }
      const result = await handler(body, trace);
      trace.ok = true;
      res.json(result);
    } catch (err) {
      trace.ok = false;
      if (err instanceof ZodError) {
        trace.error = "validation";
        res.status(400).json({
          error: "validation_error",
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      } else if (err instanceof SessionNotFound) {
        trace.error = "session_not_found";
        res.status(404).json({ error: "session_not_found", message: err.message });
      } else if (err instanceof SessionExpired) {
        trace.error = "session_expired";
        res.status(410).json({ error: "session_expired", message: err.message });
      } else if (err instanceof RevisionConflict) {
        trace.error = "revision_conflict";
        res.status(409).json({
          error: "revision_conflict",
          message: err.message,
          current_revision: err.currentRevision,
          events_since_expected: err.eventsSince,
        });
      } else {
        trace.error = "internal";
        console.error(`[${name}]`, err);
        res.status(500).json({ error: "internal_error", message: "unexpected server error" });
      }
    } finally {
      trace.latency_ms = Date.now() - started;
      try {
        await store.logAction(trace);
      } catch (err) {
        console.error("action trace failed:", err.message);
      }
    }
  };

  app.get("/", (_req, res) =>
    res.json({
      service: "motif-action-server",
      status: "ok",
      docs: "POST /actions/* per openapi.yaml; GET /healthz for liveness",
    })
  );

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // ------------------------------------------------------------ sessions

  app.post(
    "/actions/start_session",
    action("start_session", schemas.startSession, async (body, trace) => {
      const { token, manifest } = await store.createSession({
        mode: body.mode,
        label: body.label ?? null,
        retentionDays: body.retention_days ?? null,
      });
      trace.session_id = manifest.session_id;
      return {
        session_token: token,
        mode: manifest.mode,
        label: manifest.label,
        created_at: manifest.created_at,
        expires_at: manifest.expires_at,
        revision: manifest.revision,
        note: "Show this token to the user exactly once and tell them to store it safely. Anyone holding it can read and write this session.",
      };
    })
  );

  app.post(
    "/actions/load_session_context",
    action("load_session_context", schemas.tokenOnly, async (body) =>
      store.loadContext(body.session_token)
    )
  );

  app.post(
    "/actions/fork_session",
    action("fork_session", schemas.forkSession, async (body, trace) => {
      const parentManifest = await store.manifest(body.session_token);
      const parentContext = await store.loadContext(body.session_token);
      const { token, manifest } = await store.createSession({
        mode: "persistent",
        label: body.label ?? (parentManifest.label ? `${parentManifest.label} (fork)` : "fork"),
        parent: {
          session_id: parentManifest.session_id,
          revision: body.source_revision ?? parentManifest.revision,
        },
        state: {
          brief: parentContext.brief,
          banned_patterns: [...parentContext.banned_patterns],
          pinned_ref_ids: [],
          current_prototype_id: null,
        },
      });
      trace.session_id = manifest.session_id;
      await store.appendEvent(token, "session_seeded_from_fork", {
        parent_session_id: parentManifest.session_id,
        parent_revision: body.source_revision ?? parentManifest.revision,
        context: parentContext,
      });
      // Re-store the parent's pinned references so they are first-class,
      // searchable records in the child's own event log.
      if (parentContext.pinned_references.length) {
        await store.appendEvent(
          token,
          "inspo_stored",
          { references: parentContext.pinned_references },
          {
            stateUpdate: (state) => {
              state.pinned_ref_ids = parentContext.pinned_references.map((r) => r.ref_id);
            },
          }
        );
      }
      // Record the fork on the parent (no expected_revision: forking is additive).
      await store.appendEvent(body.session_token, "session_forked", {
        child_session_id: manifest.session_id,
        child_label: manifest.label,
      });
      const child = await store.manifest(token);
      return {
        session_token: token,
        parent: manifest.parent,
        revision: child.revision,
        label: manifest.label,
        note: "New independent session. Later changes will not affect the parent.",
      };
    })
  );

  app.post(
    "/actions/delete_session",
    action("delete_session", schemas.deleteSession, async (body) => {
      if (!body.confirm) {
        return {
          deleted: false,
          message: "Deletion is permanent. Re-send with confirm=true after the user confirms.",
        };
      }
      await store.deleteSession(body.session_token);
      return { deleted: true };
    })
  );

  // ------------------------------------------------------------ brief

  app.post(
    "/actions/update_brief",
    action("update_brief", schemas.updateBrief, async (body) => {
      const event = await store.appendEvent(
        body.session_token,
        "brief_updated",
        { brief: body.brief, banned_patterns: body.banned_patterns ?? undefined },
        {
          expectedRevision: body.expected_revision,
          stateUpdate: (state) => {
            state.brief = body.brief;
            if (body.banned_patterns) state.banned_patterns = body.banned_patterns;
          },
        }
      );
      return { event_id: event.id, revision: event.revision };
    })
  );

  // ------------------------------------------------------------ inspiration

  app.post(
    "/actions/search_for_inspo",
    action("search_for_inspo", schemas.searchForInspo, async (body, trace) => {
      const result = await searchInspoProvider(body);
      trace.provider = result.provider;
      trace.result_count = result.results.length;
      // Log the query (never image bytes) when a session is attached.
      if (body.session_token) {
        await store.appendEvent(body.session_token, "search_logged", {
          query: body.query,
          medium: body.medium ?? null,
          provider: result.provider,
          result_count: result.results.length,
        });
      }
      return result;
    })
  );

  app.post(
    "/actions/store_inspo",
    action("store_inspo", schemas.storeInspo, async (body) => {
      const existing = collectRefs(await store.events(body.session_token));
      const stored = [];
      const deduped = [];
      const toStore = [];
      for (const ref of body.references) {
        const match = findDuplicate(existing, ref);
        if (match) {
          deduped.push({ ref_id: match.ref_id, title: ref.title, reason: match.reason });
          continue;
        }
        const record = { ...ref, ref_id: newRefId(), stored_at: new Date().toISOString() };
        existing.push(record);
        toStore.push(record);
        stored.push({ ref_id: record.ref_id, title: record.title });
      }
      let revision = (await store.manifest(body.session_token)).revision;
      if (toStore.length) {
        const event = await store.appendEvent(
          body.session_token,
          "inspo_stored",
          { references: toStore },
          {
            expectedRevision: body.expected_revision,
            stateUpdate: (state) => {
              for (const r of toStore) {
                if (r.status === "pinned" && !state.pinned_ref_ids.includes(r.ref_id)) {
                  state.pinned_ref_ids.push(r.ref_id);
                }
              }
            },
          }
        );
        revision = event.revision;
      }
      return { stored, deduplicated: deduped, revision };
    })
  );

  app.post(
    "/actions/pin_inspiration",
    action("pin_inspiration", schemas.pinInspiration, async (body) => {
      const existing = collectRefs(await store.events(body.session_token));
      let refId = body.ref_id ?? null;
      let reference = null;
      if (refId) {
        reference = existing.find((r) => r.ref_id === refId);
        if (!reference) {
          return {
            error: "unknown_ref_id",
            message: `no stored reference ${refId}`,
            revision: (await store.manifest(body.session_token)).revision,
          };
        }
        reference = { ...reference, status: "pinned" };
        if (body.principles.length) reference.principles = body.principles;
      } else {
        refId = newRefId();
        reference = {
          ...body.reference,
          ref_id: refId,
          status: "pinned",
          principles: body.principles.length ? body.principles : body.reference.principles,
          stored_at: new Date().toISOString(),
        };
      }
      const event = await store.appendEvent(
        body.session_token,
        "inspo_pinned",
        { reference },
        {
          expectedRevision: body.expected_revision,
          stateUpdate: (state) => {
            if (!state.pinned_ref_ids.includes(refId)) state.pinned_ref_ids.push(refId);
          },
        }
      );
      return { ref_id: refId, revision: event.revision };
    })
  );

  // ------------------------------------------------------------ feedback / prototypes

  app.post(
    "/actions/store_feedback",
    action("store_feedback", schemas.storeFeedback, async (body) => {
      const feedbackId = `fb-${crypto.randomBytes(4).toString("hex")}`;
      const event = await store.appendEvent(
        body.session_token,
        "feedback_stored",
        {
          feedback_id: feedbackId,
          scope: body.scope,
          artifact_id: body.artifact_id ?? null,
          text: body.text,
          tags: body.tags,
        },
        { expectedRevision: body.expected_revision }
      );
      return { feedback_id: feedbackId, revision: event.revision };
    })
  );

  app.post(
    "/actions/store_prototype",
    action("store_prototype", schemas.storePrototype, async (body) => {
      const prototypeId = newProtoId();
      let artifactRef = body.artifact_ref ?? null;
      if (body.html) {
        artifactRef = await store.saveArtifact(
          body.session_token,
          `${prototypeId}.html`,
          body.html
        );
      }
      const event = await store.appendEvent(
        body.session_token,
        "prototype_stored",
        {
          prototype_id: prototypeId,
          direction: body.direction,
          artifact_ref: artifactRef,
          screenshot_refs: body.screenshot_refs,
          parent_version: body.parent_version ?? null,
          change_summary: body.change_summary ?? null,
          evaluation_summary: body.evaluation_summary ?? null,
        },
        {
          expectedRevision: body.expected_revision,
          stateUpdate: (state) => {
            state.current_prototype_id = prototypeId;
          },
        }
      );
      return { prototype_id: prototypeId, artifact_ref: artifactRef, revision: event.revision };
    })
  );

  app.post(
    "/actions/get_past_prototypes",
    action("get_past_prototypes", schemas.getPastPrototypes, async (body, trace) => {
      const events = await store.events(body.session_token);
      let protos = events
        .filter((e) => e.type === "prototype_stored")
        .map((e) => ({ ...e.payload, at: e.at, revision: e.revision }));
      if (body.direction) {
        const d = body.direction.toLowerCase();
        protos = protos.filter((p) => p.direction.toLowerCase().includes(d));
      }
      const result = protos.slice(-body.limit).reverse();
      trace.result_count = result.length;
      return { prototypes: result };
    })
  );

  // ------------------------------------------------------------ search / stats / export

  app.post(
    "/actions/search_session_memory",
    action("search_session_memory", schemas.searchMemory, async (body, trace) => {
      const results = await store.search(
        body.session_token,
        body.query,
        body.record_types,
        body.limit
      );
      trace.result_count = results.length;
      return { results };
    })
  );

  app.post(
    "/actions/get_session_stats",
    action("get_session_stats", schemas.tokenOnly, async (body) =>
      store.stats(body.session_token)
    )
  );

  app.post(
    "/actions/export_session",
    action("export_session", schemas.exportSession, async (body) => {
      const result = await store.export(body.session_token, body.format);
      await store.appendEvent(body.session_token, "session_exported", { format: body.format });
      return result;
    })
  );

  // ------------------------------------------------------------ debug UI
  // Local debugging only: lists every session without a token. Do not expose
  // this router on a public deployment (disable with MOTIF_DEBUG_UI=0).

  if (process.env.MOTIF_DEBUG_UI !== "0") {
    const debugRoute = (handler) => async (req, res) => {
      try {
        await handler(req, res);
      } catch (err) {
        res.status(404).json({ error: "not_found", message: err.message });
      }
    };

    app.get("/debug", (_req, res) =>
      res.sendFile(path.join(__dirname, "..", "public", "debug.html"))
    );

    app.get(
      "/debug/api/sessions",
      debugRoute(async (_req, res) => {
        const ids = await store.listSessionIds();
        const sessions = [];
        for (const id of ids) {
          const m = await store.readManifest(id);
          const events = await store.readEvents(id);
          sessions.push({
            session_id: id,
            mode: m.mode,
            label: m.label,
            created_at: m.created_at,
            expires_at: m.expires_at,
            expired: m.expires_at ? Date.now() > Date.parse(m.expires_at) : false,
            revision: m.revision,
            parent: m.parent,
            event_count: events.length,
            token_hash_prefix: m.token_hash.slice(0, 12),
          });
        }
        sessions.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        res.json({ sessions });
      })
    );

    app.get(
      "/debug/api/sessions/:id",
      debugRoute(async (req, res) => {
        const id = req.params.id;
        const manifest = await store.readManifest(id);
        res.json({
          manifest: { ...manifest, token_hash: manifest.token_hash.slice(0, 12) + "…" },
          context: await store.contextForSession(id),
          events: await store.readEvents(id),
          artifacts: await store.listArtifacts(id),
        });
      })
    );

    app.get(
      "/debug/api/sessions/:id/artifacts/:name",
      debugRoute(async (req, res) => {
        const content = await store.readArtifact(req.params.id, req.params.name);
        if (content === null) return res.status(404).json({ error: "not_found" });
        const type = req.params.name.endsWith(".html") ? "text/html" : "text/plain";
        res.type(type).send(content);
      })
    );

    app.get(
      "/debug/api/action_log",
      debugRoute(async (_req, res) => {
        const entries = await store.readActionLog(300);
        res.json({ entries: entries.reverse() });
      })
    );
  }

  return app;
}

// -------------------------------------------------------------- dedup helpers

function collectRefs(events) {
  const refs = [];
  for (const e of events) {
    if (e.type === "inspo_stored") refs.push(...(e.payload.references ?? []));
    if (e.type === "inspo_pinned" && e.payload.reference) refs.push(e.payload.reference);
  }
  return refs;
}

function canonicalUrl(url) {
  try {
    const u = new URL(url);
    return (u.host.toLowerCase() + u.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

const normTitle = (t) => (t ?? "").toLowerCase().replace(/\W+/g, " ").trim();

/** Dedup order per PRD §14.4: canonical URL, then provider ID, then title+source. */
function findDuplicate(existing, ref) {
  const url = canonicalUrl(ref.source_url);
  for (const r of existing) {
    if (canonicalUrl(r.source_url) === url) return { ref_id: r.ref_id, reason: "canonical_url" };
  }
  if (ref.provider_id) {
    for (const r of existing) {
      if (r.provider_id && r.provider_id === ref.provider_id) {
        return { ref_id: r.ref_id, reason: "provider_id" };
      }
    }
  }
  const title = normTitle(ref.title);
  if (title) {
    for (const r of existing) {
      if (
        normTitle(r.title) === title &&
        canonicalHost(r.source_url) === canonicalHost(ref.source_url)
      ) {
        return { ref_id: r.ref_id, reason: "normalized_title" };
      }
    }
  }
  return null;
}

function canonicalHost(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}
