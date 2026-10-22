import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { internalMutation, query } from "./functions";
import { decryptFields, ENCRYPTED_FIELDS } from "./lib/encryption";
import { getStaff } from "./lib/staff";

const entry = {
  actorId: v.string(),
  actorName: v.string(),
  action: v.string(),
  targetType: v.union(v.literal("user"), v.literal("organization"), v.literal("sme"), v.literal("staff")),
  targetId: v.optional(v.string()),
  targetLabel: v.optional(v.string()),
  details: v.optional(v.string()),
};

/** Written by the Better Auth admin hook (convex/auth.ts). */
export const record = internalMutation({
  args: entry,
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", args);
  },
});

/** For admin mutations in this app. */
export async function audit(
  ctx: MutationCtx,
  actor: { _id: string; name: string },
  e: {
    action: string;
    targetType: "user" | "organization" | "sme" | "staff";
    targetId?: string;
    targetLabel?: string;
    details?: string;
  },
) {
  await ctx.db.insert("auditLog", { actorId: actor._id, actorName: actor.name, ...e });
}

/** The newest admin actions. Null for anyone without audit access. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!(await getStaff(ctx, { audit: ["read"] }))) return null;
    return ctx.db
      .query("auditLog")
      .order("desc")
      .take(Math.min(args.limit ?? 200, 500));
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* The command log: every mutation and what it changed (see convex/functions.ts)                          */
/* ------------------------------------------------------------------------------------------------------ */

/** Commands, newest first, a page at a time. An empty page for anyone without audit access. */
export const commands = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    if (!(await getStaff(ctx, { audit: ["read"] }))) return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db.query("commands").order("desc").paginate(args.paginationOpts);

    // Fill in names the identity token didn't carry, and names that changed since
    const ids = [...new Set(page.page.flatMap((c) => (c.actorId ? [c.actorId] : [])))];
    const users = ids.length ? await ctx.runQuery(components.betterAuth.users.usersById, { ids }) : [];
    const names = new Map(users.map((u) => [u.id, u.name]));

    return {
      ...page,
      page: page.page.map((c) => ({
        id: c._id,
        at: c._creationTime,
        name: c.name,
        visibility: c.visibility,
        actor: c.actorId ? (names.get(c.actorId) ?? c.actorName ?? "Deleted account") : "System",
        actorId: c.actorId ?? null,
        changeCount: c.changeCount,
        tables: c.tables,
      })),
    };
  },
});

/** Everything one command changed, with encrypted values decrypted for the reader. */
export const commandChanges = query({
  args: { commandId: v.id("commands") },
  handler: async (ctx, args) => {
    if (!(await getStaff(ctx, { audit: ["read"] }))) return null;
    const changes = await ctx.db
      .query("changes")
      .withIndex("by_command", (q) => q.eq("commandId", args.commandId))
      .take(200);
    return Promise.all(changes.map(changeRow));
  },
});

/** A document's history: every change any command made to it, newest first. */
export const documentHistory = query({
  args: { table: v.string(), documentId: v.string() },
  handler: async (ctx, args) => {
    if (!(await getStaff(ctx, { audit: ["read"] }))) return null;
    const changes = await ctx.db
      .query("changes")
      .withIndex("by_document", (q) => q.eq("table", args.table).eq("documentId", args.documentId))
      .order("desc")
      .take(100);
    return Promise.all(
      changes.map(async (change) => {
        const command = await ctx.db.get("commands", change.commandId);
        return { ...(await changeRow(change)), command: command?.name ?? null, at: change._creationTime };
      }),
    );
  },
});

async function changeRow(change: Doc<"changes">) {
  const decrypt = (snapshot: unknown) =>
    snapshot && typeof snapshot === "object" ? decryptFields(change.table, snapshot as Record<string, unknown>) : null;
  const encrypted = ENCRYPTED_FIELDS[change.table as keyof typeof ENCRYPTED_FIELDS] ?? [];
  return {
    id: change._id,
    table: change.table,
    documentId: change.documentId,
    operation: change.operation,
    fields: change.fields,
    /** Which of the fields are stored encrypted, so the diff can say so. */
    encryptedFields: change.fields.filter((f) => encrypted.includes(f)),
    before: (await decrypt(change.before)) as Record<string, unknown> | null,
    after: (await decrypt(change.after)) as Record<string, unknown> | null,
  };
}
