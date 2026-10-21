import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Makes an existing account a YES Hub admin (or back to a regular user). Internal, so only the
 * Convex CLI or dashboard can run it:
 *
 *   pnpm exec convex run admin:setPlatformRole '{"email":"you@example.com","role":"admin"}'
 *   (add --prod for production)
 */
export const setPlatformRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, args) => {
    const userId = await ctx.runMutation(components.betterAuth.users.setRoleByEmail, args);
    if (!userId) throw new ConvexError(`No account with the email ${args.email}. Sign up first.`);
    return { userId, role: args.role };
  },
});

/**
 * Permanently deletes an account: its Better Auth records, its SME profile and uploaded documents.
 * Internal, so only the Convex CLI or dashboard can run it:
 *
 *   pnpm exec convex run admin:deleteAccount '{"email":"someone@example.com"}' --prod
 */
export const deleteAccount = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const userId = await ctx.runMutation(components.betterAuth.users.deleteUserByEmail, args);
    if (!userId) throw new ConvexError(`No account with the email ${args.email}.`);

    let deletedSme = false;
    const sme = await ctx.db
      .query("smes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (sme) {
      for (const doc of Object.values(sme.documents)) {
        if (doc?.storageId) await ctx.storage.delete(doc.storageId);
      }
      await ctx.db.delete("smes", sme._id);
      deletedSme = true;
    }
    return { userId, deletedSme };
  },
});
