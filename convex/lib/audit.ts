import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/*
 * An enterprise organisation's evidence trail (organizationAudit). Every decision that changes the state of
 * an opportunity or an application is written here with who made it, the reason and what changed. Entries
 * are never edited or deleted, and each carries a SHA-256 hash of its contents and the previous entry's
 * hash, so the chain can be checked: a removed, reordered or altered entry breaks it (verifyChain).
 */

export type AuditChange = { field: string; before: string; after: string };

export type AuditEntry = {
  organizationId: string;
  actorId?: string;
  actorName: string;
  action: string;
  opportunityId?: Id<"opportunities">;
  applicationId?: Id<"applications">;
  targetLabel: string;
  summary: string;
  reason?: string;
  changes?: AuditChange[];
};

const GENESIS = "0".repeat(64);

/** The fields a hash covers, in a fixed order, so the same entry always hashes the same. */
function canonical(entry: Omit<Doc<"organizationAudit">, "_id" | "_creationTime" | "hash">) {
  return JSON.stringify([
    entry.organizationId,
    entry.sequence,
    entry.actorId ?? null,
    entry.actorName,
    entry.action,
    entry.opportunityId ?? null,
    entry.applicationId ?? null,
    entry.targetLabel,
    entry.summary,
    entry.reason ?? null,
    entry.changes.map((c) => [c.field, c.before, c.after]),
    entry.previousHash,
  ]);
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Appends an entry to the organisation's trail. Two writes at once conflict and retry, so the chain stays linear. */
export async function recordAudit(ctx: MutationCtx, entry: AuditEntry) {
  const last = await ctx.db
    .query("organizationAudit")
    .withIndex("by_organization_and_sequence", (q) => q.eq("organizationId", entry.organizationId))
    .order("desc")
    .first();
  const row = {
    organizationId: entry.organizationId,
    sequence: (last?.sequence ?? 0) + 1,
    actorId: entry.actorId,
    actorName: entry.actorName,
    action: entry.action,
    opportunityId: entry.opportunityId,
    applicationId: entry.applicationId,
    targetLabel: entry.targetLabel.slice(0, 300),
    summary: entry.summary.slice(0, 1000),
    reason: entry.reason?.slice(0, 2000),
    changes: (entry.changes ?? [])
      .filter((c) => c.before !== c.after)
      .map((c) => ({ field: c.field, before: c.before.slice(0, 1000), after: c.after.slice(0, 1000) })),
    previousHash: last?.hash ?? GENESIS,
  };
  await ctx.db.insert("organizationAudit", { ...row, hash: await sha256(canonical(row)) });
}

/** Checks every entry's hash and link, oldest first. Returns where the chain breaks, if it does. */
export async function verifyChain(ctx: QueryCtx, organizationId: string, limit = 5000) {
  const entries = await ctx.db
    .query("organizationAudit")
    .withIndex("by_organization_and_sequence", (q) => q.eq("organizationId", organizationId))
    .take(limit);
  let previous = GENESIS;
  for (const [i, entry] of entries.entries()) {
    const { _id, _creationTime, hash, ...row } = entry;
    void _id;
    void _creationTime;
    if (entry.sequence !== i + 1 || entry.previousHash !== previous || (await sha256(canonical(row))) !== hash) {
      return { intact: false as const, checked: i, brokenAt: entry.sequence };
    }
    previous = hash;
  }
  return { intact: true as const, checked: entries.length, brokenAt: null };
}

/** A value as the trail shows it: dates and lists readable, empty values named. */
export function auditValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "none";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (typeof value === "number") return value.toLocaleString("en-ZA");
  return String(value);
}
