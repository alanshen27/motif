// Storage backend selection shared by the local server and the Vercel entry.

import { FileSessionStore } from "./store.js";
import { SupabaseSessionStore } from "./supabase_store.js";

/**
 * Supabase when configured, otherwise the file backend rooted at fileRoot.
 * Returns { store, backend } where backend is a human-readable description.
 */
export function createStoreFromEnv({ fileRoot }) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      store: new SupabaseSessionStore({
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      }),
      backend: `supabase (${process.env.SUPABASE_URL})`,
    };
  }
  return { store: new FileSessionStore(fileRoot), backend: `local files (${fileRoot})` };
}
