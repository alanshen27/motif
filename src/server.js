import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { FileSessionStore } from "./store.js";
import { SupabaseSessionStore } from "./supabase_store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);

let store;
let backend;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  store = new SupabaseSessionStore({
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  backend = `supabase (${process.env.SUPABASE_URL})`;
} else {
  const dataRoot = process.env.MOTIF_DATA_DIR ?? path.join(__dirname, "..", "data");
  store = new FileSessionStore(dataRoot);
  backend = `local files (${dataRoot})`;
}

const app = createApp({ store });
app.listen(port, () => {
  console.log(`Motif Action server listening on http://localhost:${port}`);
  console.log(`  storage: ${backend}`);
  console.log(`  debug:   http://localhost:${port}/debug`);
});
