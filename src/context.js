// Pure functions shared by every storage backend: canonical-context assembly,
// text search over the event log, exports, and event summaries. Backends only
// provide (manifest, events); everything here is deterministic.

export function buildContext(manifest, events) {
  const state = manifest.state;

  const refs = {};
  for (const e of events) {
    if (e.type === "inspo_stored" || e.type === "inspo_pinned") {
      const list = e.payload.references ?? (e.payload.reference ? [e.payload.reference] : []);
      for (const r of list) refs[r.ref_id] = r;
    }
  }
  const pinned = state.pinned_ref_ids.map((id) => refs[id]).filter(Boolean);

  const feedback = events
    .filter((e) => e.type === "feedback_stored")
    .map((e) => ({ ...e.payload, at: e.at }));
  const protos = events
    .filter((e) => e.type === "prototype_stored")
    .map((e) => ({ ...e.payload, at: e.at }));
  const currentProto =
    [...protos].reverse().find((p) => p.prototype_id === state.current_prototype_id) ?? null;

  const typeCounts = {};
  for (const e of events) typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;

  return {
    mode: manifest.mode,
    label: manifest.label,
    created_at: manifest.created_at,
    expires_at: manifest.expires_at,
    revision: manifest.revision,
    parent: manifest.parent,
    brief: state.brief,
    banned_patterns: state.banned_patterns,
    pinned_references: pinned,
    global_feedback: feedback.filter((f) => f.scope === "global").slice(-10),
    current_prototype: stripHtml(currentProto),
    recent_revisions: protos.slice(-5).map(stripHtml),
    event_summary: typeCounts,
  };
}

/** Exact, tokenized, field-aware text search over the event log (PRD §16.2). */
export function searchEvents(events, query, recordTypes, limit) {
  const q = query.trim().toLowerCase();
  const qTokens = q.split(/\W+/).filter(Boolean);
  const results = [];
  for (const e of events) {
    if (recordTypes.length && !recordTypes.includes(e.type)) continue;
    const raw = searchableText(e);
    const text = raw.toLowerCase();
    if (!text) continue;
    let score = 0;
    const why = [];
    if (q && text.includes(q)) {
      score += 10;
      why.push("exact phrase match");
    }
    const hits = qTokens.filter((t) => text.includes(t));
    if (hits.length) {
      score += (hits.length / Math.max(qTokens.length, 1)) * 5;
      why.push(`matched tokens: ${hits.join(", ")}`);
    }
    if (score > 0) {
      const needle = text.includes(q) ? q : hits[0] ?? "";
      const idx = text.indexOf(needle);
      const start = Math.max(0, idx - 60);
      results.push({
        record_id: e.id,
        type: e.type,
        at: e.at,
        revision: e.revision,
        score: Math.round(score * 100) / 100,
        excerpt: raw.slice(start, start + 240).trim(),
        relevance: why.join("; "),
      });
    }
  }
  results.sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)));
  return results.slice(0, limit);
}

export function buildExport(manifest, events, fmt) {
  const ctx = buildContext(manifest, events);
  if (fmt === "json") {
    return { format: "json", content: JSON.stringify({ context: ctx, events }, null, 2) };
  }
  const lines = [
    "# Motif Session Export",
    `- Mode: ${manifest.mode}  |  Revision: ${manifest.revision}`,
    `- Created: ${manifest.created_at}  |  Expires: ${manifest.expires_at}`,
    "",
    "## Brief",
    ctx.brief || "_none recorded_",
    "",
    "## Banned patterns",
    ...(ctx.banned_patterns.length ? ctx.banned_patterns.map((p) => `- ${p}`) : ["_none_"]),
    "",
    "## Pinned references",
  ];
  for (const r of ctx.pinned_references) {
    lines.push(`- **${r.title}** — ${r.creator || "unknown"} — ${r.source_url}`);
    for (const pr of r.principles ?? []) lines.push(`  - ${pr}`);
  }
  lines.push("", "## Event history");
  for (const e of events) {
    lines.push(`- r${e.revision} \`${e.type}\` ${e.at} (${e.id}): ${eventSummary(e)}`);
  }
  return { format: "markdown", content: lines.join("\n") };
}

export function buildStats(manifest, events, storageBytes) {
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const refsStored = events
    .filter((e) => e.type === "inspo_stored" || e.type === "inspo_pinned")
    .reduce((n, e) => n + (e.payload.references?.length ?? 1), 0);
  return {
    created_at: manifest.created_at,
    expires_at: manifest.expires_at,
    age_hours: Math.round(((Date.now() - Date.parse(manifest.created_at)) / 3600_000) * 10) / 10,
    revision: manifest.revision,
    event_counts: counts,
    searches_logged: counts.search_logged ?? 0,
    references_stored: refsStored,
    references_pinned: manifest.state.pinned_ref_ids.length,
    feedback_count: counts.feedback_stored ?? 0,
    prototype_count: counts.prototype_stored ?? 0,
    fork_count: counts.session_forked ?? 0,
    storage_bytes: storageBytes,
  };
}

function stripHtml(proto) {
  if (!proto) return null;
  const { html, ...rest } = proto;
  return rest;
}

export function searchableText(e) {
  const p = e.payload;
  switch (e.type) {
    case "brief_updated":
      return "brief: " + (p.brief ?? "");
    case "feedback_stored":
      return "feedback: " + (p.text ?? "") + " " + (p.tags ?? []).join(" ");
    case "inspo_stored":
    case "inspo_pinned": {
      const refs = p.references ?? (p.reference ? [p.reference] : []);
      return refs
        .map(
          (r) =>
            `inspiration: ${r.title ?? ""} ${r.creator ?? ""} ${r.source_url ?? ""} ` +
            (r.principles ?? []).join(" ") +
            " " +
            (r.notes ?? "")
        )
        .join(" ");
    }
    case "prototype_stored":
      return `prototype: ${p.direction ?? ""} ${p.change_summary ?? ""} ${p.evaluation_summary ?? ""}`;
    case "search_logged":
      return "search: " + (p.query ?? "");
    case "session_forked":
      return "fork: " + (p.child_label ?? "");
    default:
      return JSON.stringify(p);
  }
}

export function eventSummary(e) {
  const text = searchableText(e);
  return text.length > 120 ? text.slice(0, 120) + "…" : text;
}
