// Domain errors and token helpers shared by all storage backends.

import crypto from "node:crypto";

export const TOKEN_PREFIX = "mtk_";

export function newToken() {
  // 32 random bytes ≈ 256 bits of entropy.
  return TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function redactToken(token) {
  return `${TOKEN_PREFIX}…${token.slice(-4)}`;
}

export class SessionNotFound extends Error {
  constructor() {
    super(
      "unknown or deleted session token — the session may have been deleted, or server storage " +
        "may have restarted (ephemeral backend). Offer the user a new session via start_session " +
        "or continue in local mode; never fabricate restored state."
    );
  }
}

export class SessionExpired extends Error {
  constructor(expiresAt) {
    super(`session expired at ${expiresAt}`);
    this.expiresAt = expiresAt;
  }
}

export class RevisionConflict extends Error {
  constructor(currentRevision, eventsSince) {
    super(`expected revision is stale; current revision is ${currentRevision}`);
    this.currentRevision = currentRevision;
    this.eventsSince = eventsSince;
  }
}

/** An inspiration provider is selected but missing credentials/config. */
export class ProviderNotConfigured extends Error {}
