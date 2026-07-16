// Optional inspiration-search provider interface (PRD §14.3, §17).
//
// ChatGPT's built-in web search is the primary discovery path; this Action is
// a secondary, provider-specific path. Select a provider with
// MOTIF_INSPO_PROVIDER; with none configured the Action returns a structured
// "unavailable" answer telling the GPT to fall back to built-in web search —
// exactly the fallback the PRD requires. Every provider must preserve source
// attribution and provider provenance, and must not copy third-party image
// bytes.

import { ProviderNotConfigured } from "./errors.js";
import { searchArena } from "./providers/arena.js";
import { searchDribbble } from "./providers/dribbble.js";

const providers = {
  // Are.na adapter: community-curated design boards with a sanctioned API.
  // Works anonymously across public design channels; ARENA_ACCESS_TOKEN
  // (premium) upgrades it to Are.na's real full-text search.
  arena: searchArena,
  // Compliant Dribbble adapter: searches the authenticated user's own shots
  // via OAuth (requires DRIBBBLE_ACCESS_TOKEN). Dribbble's API has no public
  // search, and its terms prohibit scraping (PRD §17).
  dribbble: searchDribbble,
};

export function registerProvider(name, searchFn) {
  providers[name] = searchFn;
}

const NO_PROVIDER_GUIDANCE =
  "No external inspiration provider is configured. Use ChatGPT's built-in web search, " +
  "ask the user for reference URLs or uploads, or proceed with reference-free ideation. " +
  "Record any references you use in the Inspiration Ledger.";

export async function searchInspoProvider(params) {
  const name = process.env.MOTIF_INSPO_PROVIDER;
  const search = name && providers[name];
  if (!search) {
    return { provider: "none", available: false, results: [], guidance: NO_PROVIDER_GUIDANCE };
  }
  try {
    const results = await search(params);
    return { provider: name, available: true, results };
  } catch (err) {
    if (err instanceof ProviderNotConfigured) {
      return {
        provider: name,
        available: false,
        results: [],
        guidance: `${err.message} Until then: ${NO_PROVIDER_GUIDANCE}`,
      };
    }
    // Provider outage must not terminate the workflow (PRD §19): surface a
    // structured failure the GPT can act on rather than a 500.
    return {
      provider: name,
      available: false,
      results: [],
      guidance:
        `The ${name} provider failed (${err.message}). Fall back to ChatGPT built-in web search, ` +
        "user-provided references, or reference-free ideation.",
    };
  }
}
