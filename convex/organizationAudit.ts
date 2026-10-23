import { v } from "convex/values";

import { getEnterprise } from "./enterprise";
import { query } from "./functions";
import { verifyChain } from "./lib/audit";

/*
 * The enterprise audit log (lib/audit.ts): every decision that changed an opportunity or an application,
 * for procurement officers to show what happened, who did it and why. Every member can read it; nobody can
 * change it.
 */

/** Most entries the page reads at once. */
const AUDIT_LIMIT = 1000;

export const list = query({
  args: { opportunityId: v.optional(v.id("opportunities")) },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;
    const organizationId = enterprise.organization.id;

    const entries = args.opportunityId
      ? (
          await ctx.db
            .query("organizationAudit")
            .withIndex("by_opportunity", (q) => q.eq("opportunityId", args.opportunityId))
            .order("desc")
            .take(AUDIT_LIMIT)
        ).filter((e) => e.organizationId === organizationId)
      : await ctx.db
          .query("organizationAudit")
          .withIndex("by_organization_and_sequence", (q) => q.eq("organizationId", organizationId))
          .order("desc")
          .take(AUDIT_LIMIT);

    return {
      organizationName: enterprise.organization.name,
      entries: entries.map((e) => ({
        id: e._id,
        at: e._creationTime,
        sequence: e.sequence,
        actorName: e.actorName,
        /** People sign in; the automated review doesn't. */
        automated: !e.actorId,
        action: e.action,
        opportunityId: e.opportunityId ?? null,
        targetLabel: e.targetLabel,
        summary: e.summary,
        reason: e.reason ?? null,
        changes: e.changes,
        hash: e.hash,
      })),
    };
  },
});

/** Re-checks the whole chain of hashes, so an officer can show the record hasn't been altered. */
export const verify = query({
  args: {},
  handler: async (ctx) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;
    return verifyChain(ctx, enterprise.organization.id);
  },
});
