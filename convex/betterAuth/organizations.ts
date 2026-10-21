import { v } from "convex/values";

import { STAFF_ORG_SLUG } from "../../src/lib/permissions";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";

// Component functions are never exposed to the internet; the app wraps them in permission-checked functions.

const organizationSummary = v.object({
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  logo: v.optional(v.union(v.null(), v.string())),
  kind: v.string(),
  verificationStatus: v.string(),
  verifiedAt: v.optional(v.union(v.null(), v.number())),
  verificationNote: v.optional(v.union(v.null(), v.string())),
  createdAt: v.number(),
});

function summarize(org: Doc<"organization">) {
  return {
    id: org._id,
    name: org.name,
    slug: org.slug,
    logo: org.logo,
    kind: org.kind ?? "enterprise",
    verificationStatus: org.kind === "staff" ? "verified" : (org.verificationStatus ?? "unverified"),
    verifiedAt: org.verifiedAt,
    verificationNote: org.verificationNote,
    createdAt: org.createdAt,
  };
}

async function getOrg(ctx: QueryCtx, id: string) {
  const orgId = ctx.db.normalizeId("organization", id);
  return orgId ? ctx.db.get("organization", orgId) : null;
}

/** The organisations a user belongs to (at most one by policy), with their role in each. */
export const forUser = query({
  args: { userId: v.string() },
  returns: v.array(v.object({ ...organizationSummary.fields, role: v.string() })),
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .take(10);

    const organizations = [];
    for (const member of memberships) {
      const org = await getOrg(ctx, member.organizationId);
      if (org) organizations.push({ ...summarize(org), role: member.role });
    }
    return organizations;
  },
});

/** Newest organisations first, with member and team counts. Bounded by `limit`. */
export const list = query({
  args: { limit: v.number() },
  returns: v.array(v.object({ ...organizationSummary.fields, memberCount: v.number(), teamCount: v.number() })),
  handler: async (ctx, args) => {
    const organizations = await ctx.db.query("organization").order("desc").take(args.limit);
    const result = [];
    for (const org of organizations) {
      // Bounded: organisations are companies' teams, not crowds
      const [members, teams] = await Promise.all([
        ctx.db.query("member").withIndex("organizationId", (q) => q.eq("organizationId", org._id)).take(1000),
        ctx.db.query("team").withIndex("organizationId", (q) => q.eq("organizationId", org._id)).take(200),
      ]);
      result.push({ ...summarize(org), memberCount: members.length, teamCount: teams.length });
    }
    return result;
  },
});

/** One organisation with its members, teams and pending invitations. */
export const detail = query({
  args: { organizationId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      organization: organizationSummary,
      members: v.array(
        v.object({ id: v.string(), userId: v.string(), name: v.string(), email: v.string(), role: v.string(), createdAt: v.number(), teamIds: v.array(v.string()) }),
      ),
      teams: v.array(v.object({ id: v.string(), name: v.string(), memberCount: v.number(), createdAt: v.number() })),
      invitations: v.array(v.object({ id: v.string(), email: v.string(), role: v.optional(v.union(v.null(), v.string())), status: v.string(), expiresAt: v.number() })),
    }),
  ),
  handler: async (ctx, args) => {
    const org = await getOrg(ctx, args.organizationId);
    if (!org) return null;

    const [members, teams, invitations] = await Promise.all([
      ctx.db.query("member").withIndex("organizationId", (q) => q.eq("organizationId", org._id)).take(1000),
      ctx.db.query("team").withIndex("organizationId", (q) => q.eq("organizationId", org._id)).take(200),
      ctx.db.query("invitation").withIndex("organizationId", (q) => q.eq("organizationId", org._id)).take(500),
    ]);

    const teamMembers = new Map<string, string[]>();
    const teamCounts = new Map<string, number>();
    for (const team of teams) {
      const rows = await ctx.db.query("teamMember").withIndex("teamId", (q) => q.eq("teamId", team._id)).take(1000);
      teamCounts.set(team._id, rows.length);
      for (const row of rows) teamMembers.set(row.userId, [...(teamMembers.get(row.userId) ?? []), team._id]);
    }

    const memberRows = [];
    for (const member of members) {
      const userId = ctx.db.normalizeId("user", member.userId);
      const user = userId && (await ctx.db.get("user", userId));
      memberRows.push({
        id: member._id,
        userId: member.userId,
        name: user?.name ?? "Deleted account",
        email: user?.email ?? "",
        role: member.role,
        createdAt: member.createdAt,
        teamIds: teamMembers.get(member.userId) ?? [],
      });
    }

    return {
      organization: summarize(org),
      members: memberRows,
      teams: teams.map((t) => ({ id: t._id, name: t.name, memberCount: teamCounts.get(t._id) ?? 0, createdAt: t.createdAt })),
      invitations: invitations
        .filter((i) => i.status === "pending")
        .map((i) => ({ id: i._id, email: i.email, role: i.role, status: i.status, expiresAt: i.expiresAt })),
    };
  },
});

/** Ids of users in any organisation, split by kind (bounded), to label accounts in the admin area. */
export const memberUserIds = query({
  args: { limit: v.number() },
  returns: v.object({ enterprise: v.array(v.string()), staff: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const members = await ctx.db.query("member").take(args.limit);
    const kinds = new Map<string, string>();
    const enterprise = new Set<string>();
    const staff = new Set<string>();
    for (const member of members) {
      if (!kinds.has(member.organizationId)) {
        const org = await getOrg(ctx, member.organizationId);
        kinds.set(member.organizationId, org?.kind ?? "enterprise");
      }
      (kinds.get(member.organizationId) === "staff" ? staff : enterprise).add(member.userId);
    }
    return { enterprise: [...enterprise], staff: [...staff] };
  },
});

/** Marks an enterprise verified, rejected or back to unverified. */
export const setVerification = mutation({
  args: {
    organizationId: v.string(),
    status: v.union(v.literal("verified"), v.literal("rejected"), v.literal("unverified")),
    note: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const org = await getOrg(ctx, args.organizationId);
    if (!org || org.kind === "staff") return null;
    await ctx.db.patch("organization", org._id, {
      verificationStatus: args.status,
      verifiedAt: args.status === "verified" ? Date.now() : null,
      verificationNote: args.note ?? null,
    });
    return org.name;
  },
});

async function deleteMemberships(ctx: MutationCtx, organizationId: Id<"organization">) {
  for await (const row of ctx.db.query("member").withIndex("organizationId", (q) => q.eq("organizationId", organizationId))) {
    await ctx.db.delete("member", row._id);
  }
  for await (const team of ctx.db.query("team").withIndex("organizationId", (q) => q.eq("organizationId", organizationId))) {
    for await (const row of ctx.db.query("teamMember").withIndex("teamId", (q) => q.eq("teamId", team._id))) {
      await ctx.db.delete("teamMember", row._id);
    }
    await ctx.db.delete("team", team._id);
  }
  for await (const row of ctx.db.query("invitation").withIndex("organizationId", (q) => q.eq("organizationId", organizationId))) {
    await ctx.db.delete("invitation", row._id);
  }
}

/** Deletes an enterprise organisation with its members, teams and invitations. Accounts are kept. */
export const remove = mutation({
  args: { organizationId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const org = await getOrg(ctx, args.organizationId);
    if (!org || org.kind === "staff") return null;
    await deleteMemberships(ctx, org._id);
    // Sessions still pointing at it simply resolve to no active organisation
    await ctx.db.delete("organization", org._id);
    return org.name;
  },
});

/** Removes one member from an organisation (and its teams). */
export const removeMember = mutation({
  args: { memberId: v.string() },
  returns: v.union(v.null(), v.object({ userId: v.string(), organizationKind: v.string(), organizationName: v.string() })),
  handler: async (ctx, args) => {
    const memberId = ctx.db.normalizeId("member", args.memberId);
    const member = memberId && (await ctx.db.get("member", memberId));
    if (!member) return null;
    const org = await getOrg(ctx, member.organizationId);
    for await (const team of ctx.db.query("team").withIndex("organizationId", (q) => q.eq("organizationId", member.organizationId))) {
      for await (const row of ctx.db.query("teamMember").withIndex("teamId", (q) => q.eq("teamId", team._id))) {
        if (row.userId === member.userId) await ctx.db.delete("teamMember", row._id);
      }
    }
    await ctx.db.delete("member", member._id);
    return { userId: member.userId, organizationKind: org?.kind ?? "enterprise", organizationName: org?.name ?? "" };
  },
});

/**
 * Makes a user an owner of the YES Hub staff organisation, creating the organisation on first use.
 * Returns the staff organisation id.
 */
export const ensureStaffOwner = mutation({
  args: { userId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    let org = await ctx.db
      .query("organization")
      .withIndex("slug", (q) => q.eq("slug", STAFF_ORG_SLUG))
      .unique();
    if (!org) {
      const id = await ctx.db.insert("organization", {
        name: "YES Hub",
        slug: STAFF_ORG_SLUG,
        createdAt: Date.now(),
        kind: "staff",
        verificationStatus: "verified",
        verifiedAt: Date.now(),
      });
      org = (await ctx.db.get("organization", id))!;
    }

    const existing = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .take(10);
    const membership = existing.find((m) => m.organizationId === org._id);
    if (membership) {
      if (membership.role !== "owner") await ctx.db.patch("member", membership._id, { role: "owner" });
    } else {
      await ctx.db.insert("member", { organizationId: org._id, userId: args.userId, role: "owner", createdAt: Date.now() });
    }

    const userId = ctx.db.normalizeId("user", args.userId);
    if (userId) await ctx.db.patch("user", userId, { role: "superadmin", updatedAt: Date.now() });

    // Open their sessions in the staff organisation
    for await (const session of ctx.db.query("session").withIndex("userId", (q) => q.eq("userId", args.userId))) {
      await ctx.db.patch("session", session._id, { activeOrganizationId: org._id });
    }
    return org._id;
  },
});
