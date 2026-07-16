import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { createApp } from "../src/app.js";
import { SupabaseSessionStore } from "../src/supabase_store.js";

// The suite runs against the file backend by default. Set SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY to run the identical suite against Supabase.
const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let server, base, dataRoot;

before(async () => {
  let store;
  if (useSupabase) {
    store = new SupabaseSessionStore({
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  } else {
    dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "motif-test-"));
    store = undefined; // createApp builds the file store from dataRoot
  }
  const app = store ? createApp({ store }) : createApp({ dataRoot });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  if (dataRoot) fs.rmSync(dataRoot, { recursive: true, force: true });
});

async function post(route, body) {
  const res = await fetch(base + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("session lifecycle", () => {
  it("creates, resumes, exports, and deletes a session", async () => {
    const start = await post("/actions/start_session", { mode: "persistent", label: "kiteframe" });
    assert.equal(start.status, 200);
    const token = start.body.session_token;
    assert.match(token, /^mtk_/);
    assert.equal(start.body.revision, 0);
    assert.ok(start.body.expires_at);

    // Raw token must never be persisted (file backend: grep the data dir).
    if (dataRoot) {
      const grep = (dir) => {
        for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, d.name);
          if (d.isDirectory()) grep(p);
          else assert.ok(!fs.readFileSync(p, "utf8").includes(token), `raw token found in ${p}`);
        }
      };
      grep(dataRoot);
    }

    const ctx = await post("/actions/load_session_context", { session_token: token });
    assert.equal(ctx.status, 200);
    assert.equal(ctx.body.label, "kiteframe");
    assert.equal(ctx.body.brief, null);

    const exp = await post("/actions/export_session", { session_token: token, format: "markdown" });
    assert.equal(exp.status, 200);
    assert.match(exp.body.content, /# Motif Session Export/);

    const refuse = await post("/actions/delete_session", { session_token: token });
    assert.equal(refuse.body.deleted, false);
    const del = await post("/actions/delete_session", { session_token: token, confirm: true });
    assert.equal(del.body.deleted, true);
    const gone = await post("/actions/load_session_context", { session_token: token });
    assert.equal(gone.status, 404);
  });

  it("rejects unknown tokens", async () => {
    const r = await post("/actions/load_session_context", { session_token: "mtk_definitely_not_real_token" });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "session_not_found");
  });
});

describe("optimistic concurrency", () => {
  it("returns 409 with a compact diff on stale writes", async () => {
    const { body: s } = await post("/actions/start_session", {});
    const token = s.session_token;

    const b1 = await post("/actions/update_brief", {
      session_token: token, expected_revision: 0, brief: "A calm reading app for commuters.",
    });
    assert.equal(b1.status, 200);
    assert.equal(b1.body.revision, 1);

    // Simulated concurrent writer using the stale revision 0.
    const stale = await post("/actions/store_feedback", {
      session_token: token, expected_revision: 0, text: "make the header quieter",
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "revision_conflict");
    assert.equal(stale.body.current_revision, 1);
    assert.equal(stale.body.events_since_expected.length, 1);
    assert.equal(stale.body.events_since_expected[0].type, "brief_updated");

    const retry = await post("/actions/store_feedback", {
      session_token: token, expected_revision: stale.body.current_revision, text: "make the header quieter",
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.revision, 2);
  });
});

describe("inspiration ledger", () => {
  it("stores, deduplicates, and pins references", async () => {
    const { body: s } = await post("/actions/start_session", {});
    const token = s.session_token;
    const ref = {
      title: "Editorial dashboard by Studio K",
      source_url: "https://example.com/shots/editorial-dash/",
      principles: ["dense two-column grid", "serif display type"],
      discovery_source: "chatgpt_web_search",
    };

    const first = await post("/actions/store_inspo", {
      session_token: token, expected_revision: 0, references: [ref],
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.stored.length, 1);
    const refId = first.body.stored[0].ref_id;

    // Same canonical URL (trailing slash difference) must dedupe.
    const dup = await post("/actions/store_inspo", {
      session_token: token,
      expected_revision: first.body.revision,
      references: [{ ...ref, source_url: "https://EXAMPLE.com/shots/editorial-dash" }],
    });
    assert.equal(dup.body.stored.length, 0);
    assert.equal(dup.body.deduplicated[0].ref_id, refId);
    assert.equal(dup.body.deduplicated[0].reason, "canonical_url");

    const pin = await post("/actions/pin_inspiration", {
      session_token: token, expected_revision: dup.body.revision, ref_id: refId,
    });
    assert.equal(pin.status, 200);

    const ctx = await post("/actions/load_session_context", { session_token: token });
    assert.equal(ctx.body.pinned_references.length, 1);
    assert.equal(ctx.body.pinned_references[0].ref_id, refId);
    assert.equal(ctx.body.pinned_references[0].status, "pinned");
  });
});

describe("prototypes and search", () => {
  it("stores prototypes as artifacts and finds records under distractors", async () => {
    const { body: s } = await post("/actions/start_session", {});
    const token = s.session_token;
    let rev = 0;

    // Distractor noise.
    for (let i = 0; i < 20; i++) {
      const r = await post("/actions/store_feedback", {
        session_token: token, expected_revision: rev, text: `general note number ${i} about spacing`,
      });
      rev = r.body.revision;
    }
    const needle = await post("/actions/store_feedback", {
      session_token: token, expected_revision: rev, text: "the checkout button must use the tangerine brand color",
    });
    rev = needle.body.revision;

    const proto = await post("/actions/store_prototype", {
      session_token: token, expected_revision: rev,
      direction: "editorial-research",
      html: "<!doctype html><html><body><h1>Kiteframe</h1></body></html>",
      change_summary: "initial split-hero layout",
    });
    rev = proto.body.revision;
    assert.match(proto.body.artifact_ref, /^artifacts\/proto-/);

    const hist = await post("/actions/get_past_prototypes", { session_token: token });
    assert.equal(hist.body.prototypes.length, 1);
    assert.equal(hist.body.prototypes[0].html, undefined);

    const found = await post("/actions/search_session_memory", {
      session_token: token, query: "tangerine checkout",
    });
    assert.ok(found.body.results.length >= 1);
    assert.equal(found.body.results[0].id, undefined);
    assert.match(found.body.results[0].excerpt, /tangerine/);
    assert.equal(found.body.results[0].type, "feedback_stored");

    const stats = await post("/actions/get_session_stats", { session_token: token });
    assert.equal(stats.body.feedback_count, 21);
    assert.equal(stats.body.prototype_count, 1);
    assert.equal(stats.body.revision, rev);
  });
});

describe("forking", () => {
  it("creates an independent child seeded from the parent", async () => {
    const { body: s } = await post("/actions/start_session", { label: "parent" });
    const token = s.session_token;
    const b = await post("/actions/update_brief", {
      session_token: token, expected_revision: 0, brief: "Portfolio site for a ceramicist.",
    });
    await post("/actions/pin_inspiration", {
      session_token: token, expected_revision: b.body.revision,
      reference: { title: "Glaze studies", source_url: "https://example.com/glaze" },
    });

    const fork = await post("/actions/fork_session", { session_token: token, label: "alt direction" });
    assert.equal(fork.status, 200);
    const childToken = fork.body.session_token;
    assert.notEqual(childToken, token);
    assert.ok(fork.body.parent.session_id);

    const childCtx = await post("/actions/load_session_context", { session_token: childToken });
    assert.equal(childCtx.body.brief, "Portfolio site for a ceramicist.");
    assert.equal(childCtx.body.pinned_references.length, 1);
    assert.equal(childCtx.body.pinned_references[0].title, "Glaze studies");

    // Child edits must not touch the parent.
    await post("/actions/update_brief", {
      session_token: childToken, expected_revision: childCtx.body.revision, brief: "Something else entirely.",
    });
    const parentCtx = await post("/actions/load_session_context", { session_token: token });
    assert.equal(parentCtx.body.brief, "Portfolio site for a ceramicist.");
    assert.equal(parentCtx.body.event_summary.session_forked, 1);
  });
});

describe("inspiration provider fallback", () => {
  it("reports unavailable with fallback guidance when no provider is configured", async () => {
    const r = await post("/actions/search_for_inspo", { query: "brutalist portfolio sites" });
    assert.equal(r.status, 200);
    assert.equal(r.body.available, false);
    assert.match(r.body.guidance, /built-in web search/);
  });
});

describe("debug UI", () => {
  it("lists sessions and details without exposing tokens", async () => {
    const { body: s } = await post("/actions/start_session", { label: "debug-visible" });
    const list = await (await fetch(base + "/debug/api/sessions")).json();
    const row = list.sessions.find((x) => x.label === "debug-visible");
    assert.ok(row);
    assert.ok(!JSON.stringify(list).includes(s.session_token));

    const detail = await (await fetch(`${base}/debug/api/sessions/${row.session_id}`)).json();
    assert.equal(detail.manifest.label, "debug-visible");
    assert.ok(detail.manifest.token_hash.endsWith("…"));
    assert.ok(!JSON.stringify(detail).includes(s.session_token));

    const page = await (await fetch(base + "/debug")).text();
    assert.match(page, /session debug/);
  });
});
