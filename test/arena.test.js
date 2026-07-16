import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { searchArena } from "../src/providers/arena.js";

const channelBlocks = {
  "web-design": [
    {
      id: 201,
      class: "Link",
      state: "available",
      visibility: "public",
      title: "Brutalist studio portfolio",
      description_html: "<p>Raw grid, mono type, no radius</p>",
      source: { url: "https://studio.example/work", title: "Studio Example" },
      image: { display: { url: "https://images.are.na/201-display.png" } },
      user: { full_name: "Curator One" },
      connected_at: "2026-05-01T00:00:00Z",
    },
    {
      id: 202,
      class: "Text",
      state: "available",
      visibility: "public",
      title: "Note about brutalism",
      user: { full_name: "Curator One" },
    },
  ],
  "fonts-in-use": [
    {
      id: 301,
      class: "Image",
      state: "available",
      visibility: "public",
      title: null,
      generated_title: "Editorial serif specimen",
      source: null,
      image: { large: { url: "https://images.are.na/301-large.png" } },
      user: { username: "typefan" },
      connected_at: "2026-06-01T00:00:00Z",
    },
  ],
};

function fakeFetch(url) {
  const slug = String(url).match(/channels\/([a-z0-9-]+)\/contents/)?.[1];
  if (slug && channelBlocks[slug]) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ contents: channelBlocks[slug] }),
    });
  }
  if (String(url).includes("/v3/search")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 401,
              base_type: "Block",
              type: "Image",
              visibility: "public",
              title: "Premium result",
              user: { full_name: "Curator Two" },
              image: { display: { url: "https://images.are.na/401.png" } },
            },
          ],
        }),
    });
  }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
}

describe("arena provider", () => {
  afterEach(() => {
    delete process.env.ARENA_ACCESS_TOKEN;
    delete process.env.ARENA_CHANNELS;
  });

  it("searches public channels anonymously and normalizes results", async () => {
    process.env.ARENA_CHANNELS = "web-design,fonts-in-use";
    const results = await searchArena(
      { query: "brutalist portfolio", limit: 10 },
      { fetchImpl: fakeFetch }
    );
    assert.equal(results.length, 1); // Text block filtered out, serif specimen no match
    const r = results[0];
    assert.equal(r.title, "Brutalist studio portfolio");
    assert.equal(r.creator, "Curator One");
    assert.equal(r.source_url, "https://studio.example/work"); // original source preferred
    assert.equal(r.preview_url, "https://images.are.na/201-display.png");
    assert.equal(r.provider_id, "arena:201");
    assert.equal(r.discovery_source, "action_provider");
    assert.equal(r.provider_metadata.arena_block_url, "https://www.are.na/block/201");
    assert.equal(r.provider_metadata.mode, "v2_public_channels");
  });

  it("falls back to the Are.na block URL when a block has no external source", async () => {
    process.env.ARENA_CHANNELS = "fonts-in-use";
    const results = await searchArena(
      { query: "editorial serif", limit: 10 },
      { fetchImpl: fakeFetch }
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].source_url, "https://www.are.na/block/301");
    assert.equal(results[0].title, "Editorial serif specimen");
  });

  it("uses source_filters as channel slugs when provided", async () => {
    const results = await searchArena(
      { query: "serif", source_filters: ["fonts-in-use"], limit: 5 },
      { fetchImpl: fakeFetch }
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].provider_id, "arena:301");
  });

  it("uses v3 premium search when ARENA_ACCESS_TOKEN is set", async () => {
    process.env.ARENA_ACCESS_TOKEN = "premium-token";
    const results = await searchArena({ query: "anything", limit: 5 }, { fetchImpl: fakeFetch });
    assert.equal(results.length, 1);
    assert.equal(results[0].provider_id, "arena:401");
    assert.equal(results[0].provider_metadata.mode, "v3_search");
  });

  it("throws when every channel fails so the router can emit fallback guidance", async () => {
    const deadFetch = () => Promise.resolve({ ok: false, status: 500 });
    await assert.rejects(
      searchArena({ query: "anything", limit: 5 }, { fetchImpl: deadFetch }),
      /all Are\.na channels failed/
    );
  });
});
