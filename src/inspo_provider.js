// Optional inspiration-search provider interface (PRD §14.3, §17).
//
// ChatGPT's built-in web search is the primary discovery path; this Action is a
// secondary, provider-specific path. No compliant provider is configured by
// default, so the stub returns a structured "unavailable" answer that tells the
// GPT to fall back to built-in web search — exactly the fallback the PRD
// requires. To add a real provider, implement search() with a compliant API
// (preserving source attribution and provider provenance) and register it here.

const providers = {};

export function registerProvider(name, searchFn) {
  providers[name] = searchFn;
}

export async function searchInspoProvider({ query, medium, style_filters, source_filters, limit }) {
  const name = process.env.MOTIF_INSPO_PROVIDER;
  const search = name && providers[name];
  if (!search) {
    return {
      provider: "none",
      available: false,
      results: [],
      guidance:
        "No external inspiration provider is configured. Use ChatGPT's built-in web search, ask the user for reference URLs or uploads, or proceed with reference-free ideation. Record any references you use in the Inspiration Ledger.",
    };
  }
  const results = await search({ query, medium, style_filters, source_filters, limit });
  return { provider: name, available: true, results };
}
