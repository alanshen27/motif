import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ProviderNotConfigured } from "../src/errors.js";
import { searchDribbble } from "../src/providers/dribbble.js";

const shots = [
  {
    id: 101,
    title: "Brutalist portfolio grid",
    description: "<p>Raw concrete textures, mono type</p>",
    tags: ["brutalism", "portfolio"],
    html_url: "https://dribbble.com/shots/101",
    images: { normal: "https://cdn.dribbble.com/101/normal.png" },
    published_at: "2026-05-01T00:00:00Z",
  },
  {
    id: 102,
    title: "Pastel banking dashboard",
    description: "<p>Soft cards and charts</p>",
    tags: ["fintech", "dashboard"],
    html_url: "https://dribbble.com/shots/102",
    images: { teaser: "https://cdn.dribbble.com/102/teaser.png" },
    published_at: "2026-06-01T00:00:00Z",
  },
];

function fakeFetch(url) {
  const body = url.includes("/user/shots")
    ? url.includes("page=1") ? shots : []
    : { name: "Alan S", login: "alans", html_url: "https://dribbble.com/alans" };
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe("dribbble provider", () => {
  afterEach(() => {
    delete process.env.DRIBBBLE_ACCESS_TOKEN;
  });

  it("requires an access token", async () => {
    delete process.env.DRIBBBLE_ACCESS_TOKEN;
    await assert.rejects(
      searchDribbble({ query: "anything" }, { fetchImpl: fakeFetch }),
      ProviderNotConfigured
    );
  });

  it("filters the user's shots by query and normalizes results", async () => {
    process.env.DRIBBBLE_ACCESS_TOKEN = "test-token";
    const results = await searchDribbble(
      { query: "brutalist portfolio", limit: 10 },
      { fetchImpl: fakeFetch }
    );
    assert.equal(results.length, 1);
    const r = results[0];
    assert.equal(r.title, "Brutalist portfolio grid");
    assert.equal(r.creator, "Alan S");
    assert.equal(r.source_url, "https://dribbble.com/shots/101");
    assert.equal(r.preview_url, "https://cdn.dribbble.com/101/normal.png");
    assert.equal(r.provider_id, "dribbble:101");
    assert.equal(r.discovery_source, "action_provider");
    assert.deepEqual(r.provider_metadata.matched_terms, ["brutalist", "portfolio"]);
  });

  it("returns everything (recency-ranked) for an empty-ish match set", async () => {
    process.env.DRIBBBLE_ACCESS_TOKEN = "test-token";
    const results = await searchDribbble(
      { query: "dashboard", limit: 10 },
      { fetchImpl: fakeFetch }
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].provider_id, "dribbble:102");
  });
});
