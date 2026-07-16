// Request schemas for the Motif Action API (PRD §14).

import { z } from "zod";

const sessionToken = z.string().min(20).max(200);
const expectedRevision = z.number().int().min(0);

export const startSession = z.object({
  mode: z.enum(["temporary", "persistent"]).default("persistent"),
  label: z.string().max(200).nullish(),
  retention_days: z.number().int().min(1).max(365).nullish(),
});

export const tokenOnly = z.object({
  session_token: sessionToken,
});

export const forkSession = z.object({
  session_token: sessionToken,
  source_revision: z.number().int().min(0).nullish(),
  label: z.string().max(200).nullish(),
});

export const deleteSession = z.object({
  session_token: sessionToken,
  confirm: z.boolean().default(false),
});

export const updateBrief = z.object({
  session_token: sessionToken,
  expected_revision: expectedRevision,
  brief: z.string().max(20_000),
  banned_patterns: z.array(z.string().max(500)).nullish(),
});

export const inspoRecord = z.object({
  local_ref_id: z.string().max(100).nullish(),
  query: z.string().max(500).nullish(),
  title: z.string().max(500),
  creator: z.string().max(300).nullish(),
  source_url: z.string().max(2000),
  preview_url: z.string().max(2000).nullish(),
  discovery_source: z
    .enum(["chatgpt_web_search", "action_provider", "user_upload", "user_url"])
    .default("chatgpt_web_search"),
  provider_id: z.string().max(200).nullish(),
  principles: z.array(z.string().max(1000)).default([]),
  status: z.enum(["seen", "shortlisted", "pinned", "rejected", "used"]).default("seen"),
  affects: z.array(z.string().max(100)).default([]),
  tags: z.array(z.string().max(100)).default([]),
  discovered_at: z.string().max(50).nullish(),
  notes: z.string().max(5000).nullish(),
});

export const storeInspo = z.object({
  session_token: sessionToken,
  expected_revision: expectedRevision,
  references: z.array(inspoRecord).min(1).max(50),
});

export const pinInspiration = z
  .object({
    session_token: sessionToken,
    expected_revision: expectedRevision,
    ref_id: z.string().max(100).nullish(),
    reference: inspoRecord.nullish(),
    principles: z.array(z.string().max(1000)).default([]),
  })
  .refine((v) => v.ref_id || v.reference, {
    message: "provide ref_id (already stored) or reference (new)",
  });

export const searchForInspo = z.object({
  query: z.string().min(1).max(500),
  medium: z.string().max(100).nullish(),
  style_filters: z.array(z.string().max(100)).default([]),
  source_filters: z.array(z.string().max(100)).default([]),
  limit: z.number().int().min(1).max(25).default(10),
  session_token: sessionToken.nullish(),
});

export const storeFeedback = z.object({
  session_token: sessionToken,
  expected_revision: expectedRevision,
  scope: z.enum(["global", "artifact"]).default("global"),
  artifact_id: z.string().max(100).nullish(),
  text: z.string().min(1).max(10_000),
  tags: z.array(z.string().max(100)).default([]),
});

export const storePrototype = z.object({
  session_token: sessionToken,
  expected_revision: expectedRevision,
  direction: z.string().min(1).max(200),
  html: z.string().max(600_000).nullish(),
  artifact_ref: z.string().max(500).nullish(),
  screenshot_refs: z.array(z.string().max(500)).default([]),
  parent_version: z.string().max(100).nullish(),
  change_summary: z.string().max(2000).nullish(),
  evaluation_summary: z.string().max(5000).nullish(),
});

export const getPastPrototypes = z.object({
  session_token: sessionToken,
  direction: z.string().max(200).nullish(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const searchMemory = z.object({
  session_token: sessionToken,
  query: z.string().min(1).max(500),
  record_types: z.array(z.string().max(50)).default([]),
  limit: z.number().int().min(1).max(25).default(8),
});

export const exportSession = z.object({
  session_token: sessionToken,
  format: z.enum(["markdown", "json"]).default("markdown"),
});
