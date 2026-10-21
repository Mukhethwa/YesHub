import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

/**
 * Admin queries are read by pages that stay mounted (hidden) while the portal guard decides, so they
 * return null for non-admins instead of throwing. Anything that changes data goes through Better Auth's
 * admin endpoints, which check the role themselves.
 */
async function getAdmin(ctx: QueryCtx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  return user?.role === "admin" ? user : null;
}

// Hackathon-scale caps: admin lists show the newest records up to these limits
const LIST_LIMIT = 500;
const COUNT_LIMIT = 1000;

function capped(rows: unknown[], limit: number) {
  return { count: Math.min(rows.length, limit), more: rows.length > limit };
}

/** Headline numbers and the newest sign-ups, for the admin overview. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getAdmin(ctx))) return null;

    const [users, organizations, smes] = await Promise.all([
      ctx.runQuery(components.betterAuth.users.listUsers, { limit: COUNT_LIMIT + 1 }),
      ctx.runQuery(components.betterAuth.users.listOrganizations, { limit: COUNT_LIMIT + 1 }),
      ctx.db.query("smes").order("desc").take(COUNT_LIMIT + 1),
    ]);

    return {
      users: capped(users, COUNT_LIMIT),
      banned: users.filter((u) => u.banned).length,
      organizations: capped(organizations, COUNT_LIMIT),
      smes: capped(smes, COUNT_LIMIT),
      recentUsers: users.slice(0, 5),
      recentSmes: smes.slice(0, 5).map((s) => ({ id: s._id, companyName: s.companyName, city: s.city, hqProvince: s.hqProvince, createdAt: s._creationTime })),
    };
  },
});

/** Everyone on the platform, newest first, labelled by what kind of account they are. */
export const users = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getAdmin(ctx))) return null;

    const [users, memberIds, smes] = await Promise.all([
      ctx.runQuery(components.betterAuth.users.listUsers, { limit: LIST_LIMIT }),
      ctx.runQuery(components.betterAuth.users.memberUserIds, { limit: COUNT_LIMIT * 5 }),
      ctx.db.query("smes").take(COUNT_LIMIT * 5),
    ]);
    const enterpriseIds = new Set(memberIds);
    const smeIds = new Set(smes.map((s) => s.userId));

    return users.map((u) => ({
      ...u,
      accountType: smeIds.has(u.id) ? ("sme" as const) : enterpriseIds.has(u.id) ? ("enterprise" as const) : null,
    }));
  },
});

/** SME profiles, newest first, with their owner's account. */
export const smes = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getAdmin(ctx))) return null;

    const smes = await ctx.db.query("smes").order("desc").take(LIST_LIMIT);
    const owners = await ctx.runQuery(components.betterAuth.users.usersById, {
      ids: [...new Set(smes.map((s) => s.userId))],
    });
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    return smes.map((sme) => ({ ...sme, owner: ownerById.get(sme.userId) ?? null }));
  },
});

/** Enterprise and funder organisations, newest first. */
export const organizations = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getAdmin(ctx))) return null;
    return ctx.runQuery(components.betterAuth.users.listOrganizations, { limit: LIST_LIMIT });
  },
});

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
