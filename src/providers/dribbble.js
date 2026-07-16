// Dribbble inspiration provider — compliant with Dribbble's API terms
// (PRD §17): the v2 API is publishing-focused with no public search or shot
// stream, and its terms prohibit scraping or storing Dribbble data outside
// permitted API use. So this provider only reads the *authenticated user's own
// library* (their shots) with their OAuth access token, filters it by the
// query, and returns normalized source-linked references. Preview URLs come
// straight from the API response (permitted metadata); image bytes are never
// downloaded or stored.

import { ProviderNotConfigured } from "../errors.js";

const API = "https://api.dribbble.com/v2";
const PAGE_SIZE = 100;
const MAX_PAGES = 2;

export async function searchDribbble(
  { query, style_filters = [], limit = 10 },
  { fetchImpl = fetch } = {}
) {
  const token = process.env.DRIBBBLE_ACCESS_TOKEN;
  if (!token) {
    throw new ProviderNotConfigured(
      "Dribbble provider selected but DRIBBBLE_ACCESS_TOKEN is not set. " +
        "Create an app at https://dribbble.com/account/applications and supply a user OAuth token. " +
        "Note: the Dribbble v2 API only exposes the authenticated user's own shots — there is no public search."
    );
  }

  const get = async (url) => {
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`dribbble api ${res.status} for ${url}`);
    return res.json();
  };

  const user = await get(`${API}/user`);
  const shots = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await get(`${API}/user/shots?page=${page}&per_page=${PAGE_SIZE}`);
    shots.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const terms = [query, ...style_filters]
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean);

  const scored = shots
    .map((s) => {
      const haystack = [s.title, stripTags(s.description), ...(s.tags ?? [])]
        .join(" ")
        .toLowerCase();
      const hits = terms.filter((t) => haystack.includes(t));
      return { shot: s, score: terms.length ? hits.length / terms.length : 0.5, hits };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(b.shot.published_at ?? "").localeCompare(String(a.shot.published_at ?? ""))
    )
    .slice(0, limit);

  return scored.map(({ shot, hits }) => ({
    title: shot.title ?? `Shot ${shot.id}`,
    creator: user.name ?? user.login ?? null,
    source_url: shot.html_url,
    preview_url: shot.images?.normal ?? shot.images?.teaser ?? null,
    provider_id: `dribbble:${shot.id}`,
    tags: shot.tags ?? [],
    discovery_source: "action_provider",
    provider_metadata: {
      provider: "dribbble",
      scope: "authenticated user's own shots",
      matched_terms: hits,
      published_at: shot.published_at ?? null,
    },
  }));
}

function stripTags(html) {
  return (html ?? "").replace(/<[^>]*>/g, " ");
}
