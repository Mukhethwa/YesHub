import { v } from "convex/values";

import { mutation } from "./_generated/server";

/**
 * Sets a user's platform role (e.g. "admin" for YES Hub staff).
 * Component functions are never exposed to the internet; the app wraps this in an internal mutation.
 */
export const setRoleByEmail = mutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("user")) },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("user")
      .withIndex("email_name", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    if (!user) return null;

    await ctx.db.patch("user", user._id, { role: args.role, updatedAt: Date.now() });
    return user._id;
  },
});

/**
 * Permanently deletes an account and everything Better Auth stores for it: sessions, sign-in methods,
 * organisation and team memberships, and invitations it sent. Organisations themselves are kept.
 * Returns the deleted user id, or null if no account has that email.
 */
export const deleteUserByEmail = mutation({
  args: { email: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("user")
      .withIndex("email_name", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    if (!user) return null;

    const userId = user._id;
    for await (const row of ctx.db.query("session").withIndex("userId", (q) => q.eq("userId", userId))) {
      await ctx.db.delete("session", row._id);
    }
    for await (const row of ctx.db.query("account").withIndex("userId", (q) => q.eq("userId", userId))) {
      await ctx.db.delete("account", row._id);
    }
    for await (const row of ctx.db.query("member").withIndex("userId", (q) => q.eq("userId", userId))) {
      await ctx.db.delete("member", row._id);
    }
    for await (const row of ctx.db.query("teamMember").withIndex("userId", (q) => q.eq("userId", userId))) {
      await ctx.db.delete("teamMember", row._id);
    }
    for await (const row of ctx.db.query("invitation").withIndex("inviterId", (q) => q.eq("inviterId", userId))) {
      await ctx.db.delete("invitation", row._id);
    }
    await ctx.db.delete("user", userId);
    return userId;
  },
});
