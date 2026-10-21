import { ConvexError, v } from "convex/values";

import { isStaffRole } from "../src/lib/permissions";
import { components } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { audit } from "./audit";
import { deleteOpportunitiesForOrganization } from "./lib/opportunities";
import { getStaff, requireStaff } from "./lib/staff";
import { deleteAppData } from "./platform";

/*
 * The YES Hub admin area. Queries return null for anyone without the permission (pages stay mounted while
 * the portal guard decides, so they mustn't throw); mutations refuse. Account changes (ban, sessions,
 * impersonation, passwords) go through Better Auth's admin API, which checks the same roles.
 */

// Hackathon-scale caps: admin lists show the newest records up to these limits
const LIST_LIMIT = 500;
const COUNT_LIMIT = 1000;

const capped = (rows: unknown[]) => ({ count: Math.min(rows.length, COUNT_LIMIT), more: rows.length > COUNT_LIMIT });

/* ------------------------------------------------------------------------------------------------------ */
/* Overview                                                                                               */
/* ------------------------------------------------------------------------------------------------------ */

export const overview = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getStaff(ctx, { user: ["list"] }))) return null;

    const [users, organizations, smes] = await Promise.all([
      ctx.runQuery(components.betterAuth.users.listUsers, { limit: COUNT_LIMIT + 1 }),
      ctx.runQuery(components.betterAuth.organizations.list, { limit: COUNT_LIMIT + 1 }),
      ctx.db.query("smes").order("desc").take(COUNT_LIMIT + 1),
    ]);
    const enterprises = organizations.filter((o) => o.kind === "enterprise");
    const pending = enterprises.filter((o) => o.verificationStatus === "unverified");

    return {
      users: capped(users),
      staff: users.filter((u) => isStaffRole(u.role)).length,
      banned: users.filter((u) => u.banned).length,
      smes: capped(smes),
      unverifiedSmes: smes.filter((s) => !s.verifiedAt && !s.suspendedAt).length,
      enterprises: capped(enterprises),
      pendingEnterpriseCount: pending.length,
      pendingEnterprises: pending.slice(0, 5),
      recentUsers: users.slice(0, 5),
      recentSmes: smes.slice(0, 5).map((s) => ({
        id: s._id,
        companyName: s.companyName,
        city: s.city,
        hqProvince: s.hqProvince,
        createdAt: s._creationTime,
      })),
    };
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Users                                                                                                  */
/* ------------------------------------------------------------------------------------------------------ */

/** Everyone on the platform, newest first, labelled by what kind of account they are. */
export const users = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getStaff(ctx, { user: ["list"] }))) return null;

    const [users, members, smes] = await Promise.all([
      ctx.runQuery(components.betterAuth.users.listUsers, { limit: LIST_LIMIT }),
      ctx.runQuery(components.betterAuth.organizations.memberUserIds, { limit: COUNT_LIMIT * 5 }),
      ctx.db.query("smes").take(COUNT_LIMIT * 5),
    ]);
    const staffIds = new Set(members.staff);
    const enterpriseIds = new Set(members.enterprise);
    const smeIds = new Set(smes.map((s) => s.userId));

    return users.map((u) => ({
      ...u,
      accountType: staffIds.has(u.id)
        ? ("staff" as const)
        : smeIds.has(u.id)
          ? ("sme" as const)
          : enterpriseIds.has(u.id)
            ? ("enterprise" as const)
            : null,
    }));
  },
});

/** What an account is on YES Hub, for the user inspector. */
export const userContext = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    if (!(await getStaff(ctx, { user: ["get"] }))) return null;

    const [sme, organizations] = await Promise.all([
      ctx.db
        .query("smes")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.runQuery(components.betterAuth.organizations.forUser, { userId: args.userId }),
    ]);
    return {
      sme: sme && { id: sme._id, companyName: sme.companyName, city: sme.city, hqProvince: sme.hqProvince },
      organization: organizations[0] ?? null,
    };
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* SMEs                                                                                                   */
/* ------------------------------------------------------------------------------------------------------ */

/** SME profiles, newest first, with their owner's account. */
export const smes = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getStaff(ctx, { sme: ["read"] }))) return null;

    const smes = await ctx.db.query("smes").order("desc").take(LIST_LIMIT);
    const owners = await ctx.runQuery(components.betterAuth.users.usersById, {
      ids: [...new Set(smes.map((s) => s.userId))],
    });
    const ownerById = new Map(owners.map((o) => [o.id, o]));
    return smes.map((sme) => ({ ...sme, owner: ownerById.get(sme.userId) ?? null }));
  },
});

/** One SME profile with signed links to its documents. */
export const sme = query({
  args: { smeId: v.id("smes") },
  handler: async (ctx, args) => {
    if (!(await getStaff(ctx, { sme: ["read"] }))) return null;

    const sme = await ctx.db.get("smes", args.smeId);
    if (!sme) return null;
    const [owner] = await ctx.runQuery(components.betterAuth.users.usersById, { ids: [sme.userId] });

    const documentUrls: Record<string, string> = {};
    for (const [key, doc] of Object.entries(sme.documents)) {
      const url = doc?.storageId && (await ctx.storage.getUrl(doc.storageId));
      if (url) documentUrls[key] = url;
    }
    return { ...sme, owner: owner ?? null, documentUrls };
  },
});

export const setSmeVerified = mutation({
  args: { smeId: v.id("smes"), verified: v.boolean() },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, { sme: ["verify"] });
    const sme = await ctx.db.get("smes", args.smeId);
    if (!sme) throw new ConvexError("That SME no longer exists.");

    await ctx.db.patch(
      "smes",
      sme._id,
      args.verified ? { verifiedAt: Date.now(), verifiedBy: staff.name } : { verifiedAt: undefined, verifiedBy: undefined },
    );
    await audit(ctx, staff, {
      action: args.verified ? "sme.verify" : "sme.unverify",
      targetType: "sme",
      targetId: sme._id,
      targetLabel: sme.companyName,
    });
  },
});

export const setSmeSuspended = mutation({
  args: { smeId: v.id("smes"), suspended: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, { sme: ["suspend"] });
    const sme = await ctx.db.get("smes", args.smeId);
    if (!sme) throw new ConvexError("That SME no longer exists.");

    const reason = args.reason?.trim() || undefined;
    await ctx.db.patch(
      "smes",
      sme._id,
      args.suspended ? { suspendedAt: Date.now(), suspendedReason: reason } : { suspendedAt: undefined, suspendedReason: undefined },
    );
    await audit(ctx, staff, {
      action: args.suspended ? "sme.suspend" : "sme.reinstate",
      targetType: "sme",
      targetId: sme._id,
      targetLabel: sme.companyName,
      details: args.suspended ? reason : undefined,
    });
  },
});

/** Deletes the SME profile and its documents. The owner's account stays and can register again. */
export const deleteSme = mutation({
  args: { smeId: v.id("smes") },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, { sme: ["delete"] });
    const sme = await ctx.db.get("smes", args.smeId);
    if (!sme) return;

    await deleteAppData(ctx, sme.userId);
    await audit(ctx, staff, { action: "sme.delete", targetType: "sme", targetId: sme._id, targetLabel: sme.companyName });
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Organisations (enterprises and funders)                                                                */
/* ------------------------------------------------------------------------------------------------------ */

export const organizations = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getStaff(ctx, { organization: ["read"] }))) return null;
    const all = await ctx.runQuery(components.betterAuth.organizations.list, { limit: LIST_LIMIT });
    return all.filter((o) => o.kind === "enterprise");
  },
});

export const organization = query({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    if (!(await getStaff(ctx, { organization: ["read"] }))) return null;
    return ctx.runQuery(components.betterAuth.organizations.detail, args);
  },
});

export const setOrganizationVerification = mutation({
  args: {
    organizationId: v.string(),
    status: v.union(v.literal("verified"), v.literal("rejected"), v.literal("unverified")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, { organization: ["verify"] });
    const note = args.note?.trim() || undefined;
    const name = await ctx.runMutation(components.betterAuth.organizations.setVerification, { ...args, note });
    if (!name) throw new ConvexError("That organisation can’t be verified.");

    const action = args.status === "verified" ? "verify" : args.status === "rejected" ? "reject" : "unverify";
    await audit(ctx, staff, {
      action: `organization.${action}`,
      targetType: "organization",
      targetId: args.organizationId,
      targetLabel: name,
      details: note,
    });
  },
});

export const deleteOrganization = mutation({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, { organization: ["delete"] });
    const name = await ctx.runMutation(components.betterAuth.organizations.remove, args);
    if (!name) throw new ConvexError("That organisation can’t be deleted.");
    await deleteOpportunitiesForOrganization(ctx, args.organizationId);
    await audit(ctx, staff, {
      action: "organization.delete",
      targetType: "organization",
      targetId: args.organizationId,
      targetLabel: name,
    });
  },
});

/** Removes a member from an enterprise organisation. Staff are managed from the Staff page. */
export const removeOrganizationMember = mutation({
  args: { memberId: v.string(), memberEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, { organization: ["manage-members"] });
    const removed = await ctx.runMutation(components.betterAuth.organizations.removeMember, { memberId: args.memberId });
    if (!removed) return;
    if (removed.organizationKind === "staff") {
      // Leaving the staff organisation ends staff access
      await ctx.runMutation(components.betterAuth.users.setRoleById, { userId: removed.userId, role: "user" });
    }
    await audit(ctx, staff, {
      action: "organization.remove-member",
      targetType: "organization",
      targetLabel: removed.organizationName,
      details: args.memberEmail,
    });
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Staff                                                                                                  */
/* ------------------------------------------------------------------------------------------------------ */

/** The YES Hub staff organisation: members with their access levels, and pending invitations. */
export const staff = query({
  args: {},
  handler: async (ctx) => {
    const me = await getStaff(ctx, { user: ["list"] });
    if (!me) return null;
    const organizations = await ctx.runQuery(components.betterAuth.organizations.forUser, { userId: me._id });
    const staffOrg = organizations.find((o) => o.kind === "staff");
    if (!staffOrg) return null;
    return ctx.runQuery(components.betterAuth.organizations.detail, { organizationId: staffOrg.id });
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* CLI                                                                                                    */
/* ------------------------------------------------------------------------------------------------------ */

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
    const deletedSme = await deleteAppData(ctx, userId);
    return { userId, deletedSme };
  },
});
