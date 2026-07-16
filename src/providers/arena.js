// Are.na inspiration provider (PRD §14.3, §17).
//
// Are.na is community-curated design/research boards with a real API, which
// makes it a compliant provider: results are source-linked, attributed, and
// we never copy image bytes — preview URLs come straight from the API.
//
// Two modes, checked in order:
//
// 1. Premium search (ARENA_ACCESS_TOKEN set): GET /v3/search — Are.na's real
//    full-text search. The v3 search endpoints are authenticated and
//    premium-only (the v2 ones were retired after scraper abuse).
// 2. Anonymous curated channels (no token): the v2 API still serves *public
//    channel contents* without auth, so we search across a small allowlist of
//    public design channels and rank blocks against the query locally.
//    Override the allowlist with ARENA_CHANNELS (comma-separated slugs) or
//    per-request via source_filters.

const V2 = "https://api.are.na/v2";
const V3 = "https://api.are.na/v3";
const PAGE_SIZE = 100;

// Public design channels verified to be readable without auth.
const DEFAULT_CHANNELS = [
  "web-design",
  "brutalist-websites",
  "beautiful-websites",
  "motion-design",
  "fonts-in-use",
];

export async function searchArena(
  { query, style_filters = [], source_filters = [], limit = 10 },
  { fetchImpl = fetch } = {}
) {
  const token = process.env.ARENA_ACCESS_TOKEN;
  const terms = tokenize([query, ...style_filters].join(" "));

  if (token) {
    return searchV3({ query, terms, limit, token, fetchImpl });
  }
  return searchPublicChannels({ terms, source_filters, limit, fetchImpl });
}

// ------------------------------------------------------------ v3 (premium)

async function searchV3({ query, terms, limit, token, fetchImpl }) {
  const url =
    `${V3}/search?query=${encodeURIComponent(query)}` +
    `&type=${encodeURIComponent("Image,Link,Embed")}&per=${Math.min(limit * 2, 50)}`;
  const res = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`are.na v3 search ${res.status}`);
  const { data = [] } = await res.json();

  return data
    .filter((b) => b.base_type === "Block" && b.visibility !== "private")
    .slice(0, limit)
    .map((b) => normalizeBlock(b, { mode: "v3_search", matched: terms }));
}

// ------------------------------------------------ v2 public channels (free)

async function searchPublicChannels({ terms, source_filters, limit, fetchImpl }) {
  const slugs = channelSlugs(source_filters);

  const settled = await Promise.allSettled(
    slugs.map(async (slug) => {
      const res = await fetchImpl(`${V2}/channels/${slug}/contents?page=1&per=${PAGE_SIZE}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`are.na channel ${slug} ${res.status}`);
      const { contents = [] } = await res.json();
      return contents.map((b) => ({ ...b, _channel: slug }));
    })
  );
  const blocks = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (settled.every((r) => r.status === "rejected")) {
    throw new Error(`all Are.na channels failed (${slugs.join(", ")})`);
  }

  return blocks
    .filter(
      (b) =>
        b.state !== "failed" &&
        b.visibility !== "private" &&
        ["Image", "Link", "Media"].includes(b.class)
    )
    .map((b) => {
      const haystack = [
        b.title,
        b.generated_title,
        stripTags(b.description_html ?? b.description),
        b.source?.title,
        b.source?.url,
        b._channel,
      ]
        .join(" ")
        .toLowerCase();
      const hits = terms.filter((t) => haystack.includes(t));
      return { block: b, hits, score: terms.length ? hits.length / terms.length : 0.5 };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(b.block.connected_at ?? b.block.created_at ?? "").localeCompare(
          String(a.block.connected_at ?? a.block.created_at ?? "")
        )
    )
    .slice(0, limit)
    .map(({ block, hits }) =>
      normalizeBlock(block, { mode: "v2_public_channels", matched: hits, channel: block._channel })
    );
}

function channelSlugs(source_filters) {
  const fromRequest = (source_filters ?? []).filter((s) => /^[a-z0-9-]+$/.test(s));
  if (fromRequest.length) return fromRequest.slice(0, 8);
  const fromEnv = (process.env.ARENA_CHANNELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv.slice(0, 8) : DEFAULT_CHANNELS;
}

// ------------------------------------------------------------ normalization

function normalizeBlock(b, { mode, matched = [], channel = null }) {
  const arenaUrl = `https://www.are.na/block/${b.id}`;
  return {
    title: b.title ?? b.generated_title ?? `Are.na block ${b.id}`,
    creator: b.user?.full_name ?? b.user?.username ?? null,
    // Prefer the original page the block was created from; the Are.na block
    // page is always preserved in provider_metadata for attribution.
    source_url: b.source?.url ?? arenaUrl,
    preview_url: previewUrl(b),
    provider_id: `arena:${b.id}`,
    tags: channel ? [channel] : [],
    discovery_source: "action_provider",
    provider_metadata: {
      provider: "arena",
      mode,
      arena_block_url: arenaUrl,
      channel,
      block_class: b.class ?? b.type ?? null,
      original_source_title: b.source?.title ?? null,
      matched_terms: matched,
      connected_at: b.connected_at ?? b.created_at ?? null,
    },
  };
}

function previewUrl(b) {
  const img = b.image;
  if (!img) return null;
  return img.display?.url ?? img.large?.url ?? img.square?.url ?? img.thumb?.url ?? img.url ?? null;
}

function tokenize(text) {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

function stripTags(html) {
  return typeof html === "string" ? html.replace(/<[^>]*>/g, " ") : "";
}
