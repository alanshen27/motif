// Vercel serverless entry point.
//
// Vercel functions must export a handler instead of calling app.listen, and
// the deployment filesystem is read-only except /tmp — so the file backend
// (a) must never write into the project directory and (b) is only a demo
// fallback here, since /tmp is ephemeral and per-instance. Configure
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the Vercel project for real
// persistence.

import os from "node:os";
import path from "node:path";

import { createApp } from "../src/app.js";
import { createStoreFromEnv } from "../src/backend.js";

// The debug UI lists every session without auth; never expose it by default
// on a public deployment. Set MOTIF_DEBUG_UI=1 explicitly to override.
process.env.MOTIF_DEBUG_UI ??= "0";

const { store } = createStoreFromEnv({
  fileRoot: path.join(os.tmpdir(), "motif-data"),
});

// An Express app is a (req, res) handler, which is exactly what Vercel expects.
export default createApp({ store });
