import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";

// Internal functions the Better Auth hooks (convex/auth.ts) call, and CLI tooling.

/** Whether an account already has an SME profile or an organisation. */
export const accountState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const [sme, organizations] = await Promise.all([
      ctx.db
        .query("smes")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.runQuery(components.betterAuth.organizations.forUser, { userId: args.userId }),
    ]);
    return { hasSmeProfile: sme !== null, organizations };
  },
});

/** The account's organisation, to open each session in it. */
export const organizationIdForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const organizations = await ctx.runQuery(components.betterAuth.organizations.forUser, { userId: args.userId });
    return organizations[0]?.id ?? null;
  },
});

export const setPlatformRoleById = internalMutation({
  args: { userId: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.betterAuth.users.setRoleById, args);
  },
});

export const makeStaffOwner = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.betterAuth.organizations.ensureStaffOwner, args);
  },
});

/** Removes everything YES Hub keeps for an account outside Better Auth: its SME profile and files. */
export async function deleteAppData(ctx: MutationCtx, userId: string) {
  const sme = await ctx.db
    .query("smes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!sme) return false;
  for (const doc of Object.values(sme.documents)) {
    if (doc?.storageId) await ctx.storage.delete(doc.storageId);
  }
  await ctx.db.delete("smes", sme._id);
  return true;
}

export const deleteAppDataForUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await deleteAppData(ctx, args.userId);
  },
});

/**
 * Makes an existing account an owner (super admin) of the YES Hub staff organisation. CLI only:
 *
 *   pnpm exec convex run platform:makeSuperAdmin '{"email":"you@example.com"}'   (add --prod for production)
 *
 * New accounts listed in SUPER_ADMIN_EMAILS get this automatically when they sign up.
 */
export const makeSuperAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(components.betterAuth.users.idByEmail, args);
    if (!userId) throw new ConvexError(`No account with the email ${args.email}. Sign up first.`);
    const organizationId = await ctx.runMutation(components.betterAuth.organizations.ensureStaffOwner, { userId });
    return { userId, organizationId };
  },
});
