import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, type QueryCtx, query } from "./_generated/server";
import { organizationsFor } from "./account";
import { authComponent } from "./auth";
import { evaluateApplication } from "./lib/evaluation";
import {
  APPLICATION_LIMIT,
  deleteOpportunitiesForOrganization,
  insertSampleOpportunities,
} from "./lib/opportunities";

/** Most opportunities shown on the dashboard. */
const OPPORTUNITY_LIMIT = 100;

/** The signed-in user's enterprise organisation, or null for SMEs, staff and anyone without one. */
async function getEnterprise(ctx: QueryCtx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  const organization = (await organizationsFor(ctx, user._id)).find((org) => org.kind === "enterprise");
  return organization ? { user, organization } : null;
}

async function applicationsFor(ctx: QueryCtx, opportunity: Doc<"opportunities">) {
  return ctx.db
    .query("applications")
    .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
    .take(APPLICATION_LIMIT);
}

function summarize(opportunity: Doc<"opportunities">, applications: Doc<"applications">[]) {
  return {
    id: opportunity._id,
    kind: opportunity.kind,
    title: opportunity.title,
    reference: opportunity.reference,
    industry: opportunity.industry,
    provinces: opportunity.provinces,
    value: opportunity.value ?? null,
    closesAt: opportunity.closesAt,
    status: opportunity.status,
    createdAt: opportunity._creationTime,
    applications: applications.length,
    qualified: applications.filter((a) => a.evaluation.qualifies).length,
    shortlisted: applications.filter((a) => a.status === "shortlisted").length,
  };
}

/**
 * The corporate dashboard: every opportunity the organisation has listed, with how many SMEs applied and
 * how many qualify. Null when the signed-in user has no enterprise organisation.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;

    const opportunities = await ctx.db
      .query("opportunities")
      .withIndex("by_organization", (q) => q.eq("organizationId", enterprise.organization.id))
      .order("desc")
      .take(OPPORTUNITY_LIMIT);

    const rows = await Promise.all(
      opportunities.map(async (opportunity) => summarize(opportunity, await applicationsFor(ctx, opportunity))),
    );

    return {
      organization: {
        id: enterprise.organization.id,
        name: enterprise.organization.name,
        role: enterprise.organization.role,
        verificationStatus: enterprise.organization.verificationStatus,
      },
      opportunities: rows,
      more: opportunities.length === OPPORTUNITY_LIMIT,
    };
  },
});

/** One of the organisation's opportunities with its applicants, best fit first. */
export const opportunity = query({
  args: { opportunityId: v.string() },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;

    const id = ctx.db.normalizeId("opportunities", args.opportunityId);
    const opportunity = id ? await ctx.db.get("opportunities", id) : null;
    // Another organisation's opportunity looks the same as one that doesn't exist
    if (!opportunity || opportunity.organizationId !== enterprise.organization.id) return null;

    const applications = await applicationsFor(ctx, opportunity);
    const applicants = [];
    for (const application of applications) {
      const sme = await ctx.db.get("smes", application.smeId);
      if (!sme) continue;
      applicants.push({
        id: application._id,
        status: application.status,
        submittedAt: application.submittedAt,
        evaluation: application.evaluation,
        sme: {
          id: sme._id,
          companyName: sme.companyName,
          industry: sme.industry,
          city: sme.city,
          hqProvince: sme.hqProvince,
          bbbeeLevel: sme.bbbeeLevel,
          employees: sme.employees,
          verified: !!sme.verifiedAt,
        },
      });
    }
    applicants.sort(
      (a, b) =>
        Number(b.evaluation.qualifies) - Number(a.evaluation.qualifies) ||
        b.evaluation.score - a.evaluation.score ||
        a.submittedAt - b.submittedAt,
    );

    return {
      ...summarize(opportunity, applications),
      description: opportunity.description,
      services: opportunity.services,
      minBbbeeLevel: opportunity.minBbbeeLevel ?? null,
      requiredDocuments: opportunity.requiredDocuments,
      applicants,
    };
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Development helpers                                                                                    */
/* ------------------------------------------------------------------------------------------------------ */

function assertDevSite() {
  if (!process.env.SITE_URL?.startsWith("http://localhost")) {
    throw new ConvexError("Sample tenders are only available in development.");
  }
}

/** Dev only: fills the signed-in user's organisation with sample tenders and applications. */
export const addSampleOpportunities = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevSite();
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) throw new ConvexError("Create your organisation first.");
    const smes = await ctx.db.query("smes").take(1);
    if (smes.length === 0) {
      throw new ConvexError("There are no SMEs to apply yet. Run: pnpm exec convex run seed:devData");
    }
    return insertSampleOpportunities(ctx, {
      organizationId: enterprise.organization.id,
      organizationName: enterprise.organization.name,
      createdBy: enterprise.user._id,
    });
  },
});

/** Dev only: removes the sample tenders added by addSampleOpportunities, with their applications. */
export const removeSampleOpportunities = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevSite();
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;
    await deleteOpportunitiesForOrganization(ctx, enterprise.organization.id, true);
    return null;
  },
});

/**
 * Re-runs the eligibility check on every application (or one opportunity's), e.g. after documents expire
 * or the rules change. The Jev integration will re-rank through the same path. CLI:
 *
 *   pnpm exec convex run enterprise:reevaluate
 */
export const reevaluate = internalMutation({
  args: { opportunityId: v.optional(v.id("opportunities")) },
  handler: async (ctx, args) => {
    const applications = args.opportunityId
      ? await ctx.db
          .query("applications")
          .withIndex("by_opportunity", (q) => q.eq("opportunityId", args.opportunityId!))
          .take(APPLICATION_LIMIT)
      : await ctx.db.query("applications").take(1000);

    let updated = 0;
    for (const application of applications) {
      const [opportunity, sme] = await Promise.all([
        ctx.db.get("opportunities", application.opportunityId),
        ctx.db.get("smes", application.smeId),
      ]);
      if (!opportunity || !sme) continue;
      await ctx.db.patch("applications", application._id, { evaluation: evaluateApplication(opportunity, sme) });
      updated++;
    }
    return updated;
  },
});

/** Seed step: sample tenders for a seeded enterprise (see seed:devData). */
export const seedSampleOpportunities = internalMutation({
  args: { organizationId: v.string(), organizationName: v.string(), createdBy: v.string() },
  handler: async (ctx, args) => insertSampleOpportunities(ctx, args),
});
