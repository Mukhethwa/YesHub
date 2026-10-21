import { v } from "convex/values";

import { internalMutation, type MutationCtx, query } from "./_generated/server";
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
  e: { action: string; targetType: "user" | "organization" | "sme" | "staff"; targetId?: string; targetLabel?: string; details?: string },
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
