import { v } from "convex/values";

import { STAFF_ORG_SLUG } from "../../src/lib/permissions";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";

/**
 * Dev seed for organisations, teams, members, invitations and account flags. Called by convex/seed.ts,
 * which only runs against local development sites. Idempotent: existing slugs are left alone.
 */

const seedOrganization = v.object({
  name: v.string(),
  slug: v.string(),
  verificationStatus: v.string(),
  verificationNote: v.optional(v.string()),
  teams: v.array(v.string()),
  members: v.array(v.object({ userId: v.string(), role: v.string(), teams: v.array(v.string()) })),
  invitations: v.array(v.object({ email: v.string(), role: v.string(), inviterId: v.string() })),
});

async function insertOrganization(ctx: MutationCtx, org: typeof seedOrganization.type, kind: string) {
  const existing = await ctx.db
    .query("organization")
    .withIndex("slug", (q) => q.eq("slug", org.slug))
    .unique();
  if (existing) return existing._id;

  const now = Date.now();
  const organizationId = await ctx.db.insert("organization", {
    name: org.name,
    slug: org.slug,
    createdAt: now,
    kind,
    verificationStatus: org.verificationStatus,
    verifiedAt: org.verificationStatus === "verified" ? now : null,
    verificationNote: org.verificationNote ?? null,
  });

  const teamIds = new Map<string, Id<"team">>();
  for (const name of org.teams) {
    teamIds.set(name, await ctx.db.insert("team", { name, organizationId, createdAt: now }));
  }
  for (const member of org.members) {
    await ctx.db.insert("member", { organizationId, userId: member.userId, role: member.role, createdAt: now });
    for (const team of member.teams) {
      const teamId = teamIds.get(team);
      if (teamId) await ctx.db.insert("teamMember", { teamId, userId: member.userId, createdAt: now });
    }
  }
  for (const invitation of org.invitations) {
    await ctx.db.insert("invitation", {
      organizationId,
      email: invitation.email,
      role: invitation.role,
      status: "pending",
      inviterId: invitation.inviterId,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      createdAt: now,
    });
  }
  return organizationId;
}

export const organizations = mutation({
  args: {
    enterprises: v.array(seedOrganization),
    staff: v.array(v.object({ userId: v.string(), role: v.string() })),
    staffInvitations: v.array(v.object({ email: v.string(), role: v.string(), inviterId: v.string() })),
    banned: v.array(v.object({ userId: v.string(), reason: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const org of args.enterprises) await insertOrganization(ctx, org, "enterprise");

    // Staff join the existing YES Hub organisation with their access level
    const staffOrg = await ctx.db
      .query("organization")
      .withIndex("slug", (q) => q.eq("slug", STAFF_ORG_SLUG))
      .unique();
    if (staffOrg) {
      for (const member of args.staff) {
        const memberships = await ctx.db
          .query("member")
          .withIndex("userId", (q) => q.eq("userId", member.userId))
          .take(5);
        if (memberships.length === 0) {
          await ctx.db.insert("member", {
            organizationId: staffOrg._id,
            userId: member.userId,
            role: member.role,
            createdAt: Date.now(),
          });
        }
        const userId = ctx.db.normalizeId("user", member.userId);
        if (userId) await ctx.db.patch("user", userId, { role: member.role === "owner" ? "superadmin" : member.role });
      }
      const pending = await ctx.db
        .query("invitation")
        .withIndex("organizationId", (q) => q.eq("organizationId", staffOrg._id))
        .take(100);
      for (const invitation of args.staffInvitations) {
        if (pending.some((p) => p.email === invitation.email)) continue;
        await ctx.db.insert("invitation", {
          organizationId: staffOrg._id,
          email: invitation.email,
          role: invitation.role,
          status: "pending",
          inviterId: invitation.inviterId,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          createdAt: Date.now(),
        });
      }
    }

    for (const { userId, reason } of args.banned) {
      const id = ctx.db.normalizeId("user", userId);
      if (id) await ctx.db.patch("user", id, { banned: true, banReason: reason });
    }
    return null;
  },
});
