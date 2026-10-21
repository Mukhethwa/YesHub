import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

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

/** The organisations a user belongs to, with their role in each. */
export const organizationsForUser = query({
  args: { userId: v.string() },
  returns: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string(), role: v.string() })),
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .take(50);

    const organizations = [];
    for (const member of memberships) {
      const orgId = ctx.db.normalizeId("organization", member.organizationId);
      const org = orgId && (await ctx.db.get("organization", orgId));
      if (org) organizations.push({ id: org._id, name: org.name, slug: org.slug, role: member.role });
    }
    return organizations;
  },
});

const userSummary = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  emailVerified: v.boolean(),
  image: v.optional(v.union(v.null(), v.string())),
  role: v.optional(v.union(v.null(), v.string())),
  banned: v.optional(v.union(v.null(), v.boolean())),
  banReason: v.optional(v.union(v.null(), v.string())),
  banExpires: v.optional(v.union(v.null(), v.number())),
  createdAt: v.number(),
});

/** Newest accounts first, for the admin area. Bounded: callers pass a limit. */
export const listUsers = query({
  args: { limit: v.number() },
  returns: v.array(userSummary),
  handler: async (ctx, args) => {
    const users = await ctx.db.query("user").order("desc").take(args.limit);
    return users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      image: u.image,
      role: u.role,
      banned: u.banned,
      banReason: u.banReason,
      banExpires: u.banExpires,
      createdAt: u.createdAt,
    }));
  },
});

/** Look up several accounts by id (e.g. the owners of SME profiles). */
export const usersById = query({
  args: { ids: v.array(v.string()) },
  returns: v.array(v.object({ id: v.string(), name: v.string(), email: v.string() })),
  handler: async (ctx, args) => {
    const users = [];
    for (const id of args.ids) {
      const userId = ctx.db.normalizeId("user", id);
      const user = userId && (await ctx.db.get("user", userId));
      if (user) users.push({ id: user._id, name: user.name, email: user.email });
    }
    return users;
  },
});

/** Newest organisations first, with member counts, for the admin area. */
export const listOrganizations = query({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      slug: v.string(),
      logo: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
      memberCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const organizations = await ctx.db.query("organization").order("desc").take(args.limit);
    const result = [];
    for (const org of organizations) {
      // Bounded: organisations on YES Hub are teams, not crowds
      const members = await ctx.db
        .query("member")
        .withIndex("organizationId", (q) => q.eq("organizationId", org._id))
        .take(500);
      result.push({
        id: org._id,
        name: org.name,
        slug: org.slug,
        logo: org.logo,
        createdAt: org.createdAt,
        memberCount: members.length,
      });
    }
    return result;
  },
});

/** Ids of users who belong to at least one organisation (bounded), to label enterprise accounts. */
export const memberUserIds = query({
  args: { limit: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const members = await ctx.db.query("member").take(args.limit);
    return [...new Set(members.map((m) => m.userId))];
  },
});
