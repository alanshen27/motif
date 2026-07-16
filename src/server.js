import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { createStoreFromEnv } from "./backend.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);

const { store, backend } = createStoreFromEnv({
  fileRoot: process.env.MOTIF_DATA_DIR ?? path.join(__dirname, "..", "data"),
});

const app = createApp({ store });
app.listen(port, () => {
  console.log(`Motif Action server listening on http://localhost:${port}`);
  console.log(`  storage: ${backend}`);
  console.log(`  debug:   http://localhost:${port}/debug`);
});
