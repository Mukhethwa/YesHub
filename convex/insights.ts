import { v } from "convex/values";

import { getSettings } from "../src/lib/sme/settings";
import { components } from "./_generated/api";
import { getEnterprise } from "./enterprise";
import { query } from "./functions";
import { computeInsights } from "./lib/insights";
import { getStaff } from "./lib/staff";

/*
 * Insights for MASLink staff (Admin, Analytics, Insights): the gaps many SMEs share and what they hold back.
 * The work is in lib/insights.ts. Capped at hackathon scale, like the analytics.
 */

const LIMIT = 5000;

export const platform = query({
  args: {
    /** yyyy-mm-dd from the browser, so expiry and "still open" don't depend on reading the clock here. */
    today: v.string(),
    /** Narrow to SMEs in one province or one industry. */
    province: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await getStaff(ctx, { user: ["list"] }))) return null;

    const [allSmes, opportunities, applications, organizations] = await Promise.all([
      ctx.db.query("smes").take(LIMIT),
      ctx.db.query("opportunities").take(LIMIT),
      ctx.db.query("applications").take(LIMIT),
      ctx.runQuery(components.betterAuth.organizations.list, { limit: 500 }),
    ]);
    const active = allSmes.filter((s) => !s.suspendedAt);
    const smes = active.filter(
      (s) => (!args.province || s.hqProvince === args.province) && (!args.industry || s.industry === args.industry),
    );
    const insights = computeInsights({
      smes,
      opportunities,
      applications,
      organizationNames: new Map(organizations.map((o) => [o.id, o.name])),
      today: args.today,
    });
    const smeIds = new Set(smes.map((s) => s._id as string));
    return {
      insights,
      analysed: {
        smes: smes.length,
        applications: applications.filter((a) => smeIds.has(a.smeId)).length,
        openOpportunities: opportunities.filter((o) => o.status === "open" && o.closesAt >= args.today).length,
      },
      /** For the filters: every province and industry with active SMEs. */
      provinces: [...new Set(active.map((s) => s.hqProvince).filter(Boolean))].sort(),
      industries: [...new Set(active.map((s) => s.industry).filter(Boolean))].sort(),
    };
  },
});

/**
 * The same insights for one enterprise organisation: the gaps among the SMEs that applied to its listings,
 * and services its open listings ask for that few visible SMEs offer. SMEs appear by company only: contact
 * details follow each SME's own sharing setting, so they aren't part of insights.
 */
export const organisation = query({
  args: { today: v.string(), province: v.optional(v.string()), industry: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;
    const organizationId = enterprise.organization.id;

    const [opportunities, applications, everyone] = await Promise.all([
      ctx.db
        .query("opportunities")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .take(LIMIT),
      ctx.db
        .query("applications")
        .withIndex("by_organization_and_status", (q) => q.eq("organizationId", organizationId))
        .take(LIMIT),
      ctx.db.query("smes").take(LIMIT),
    ]);
    const applied = new Set(applications.map((a) => a.smeId as string));
    const applicants = everyone.filter((s) => applied.has(s._id) && !s.suspendedAt);
    const smes = applicants.filter(
      (s) => (!args.province || s.hqProvince === args.province) && (!args.industry || s.industry === args.industry),
    );
    const insights = computeInsights({
      smes,
      suppliers: everyone.filter((s) => !s.suspendedAt && (applied.has(s._id) || getSettings(s).profileVisible)),
      opportunities,
      applications,
      organizationNames: new Map([[organizationId, enterprise.organization.name]]),
      today: args.today,
      audience: "organisation",
    })
      // Verifying profiles is MASLink's job, not something the organisation can act on
      .filter((insight) => insight.id !== "profile-verified")
      .map((insight) => ({
        ...insight,
        // Every buyer here is this organisation, and contact details aren't the organisation's to see yet
        buyers: [],
        smes: insight.smes.map((s) => ({ ...s, email: "" })),
      }));
    const smeIds = new Set(smes.map((s) => s._id as string));
    return {
      insights,
      analysed: {
        smes: smes.length,
        applications: applications.filter((a) => smeIds.has(a.smeId)).length,
        openOpportunities: opportunities.filter((o) => o.status === "open" && o.closesAt >= args.today).length,
      },
      provinces: [...new Set(applicants.map((s) => s.hqProvince).filter(Boolean))].sort(),
      industries: [...new Set(applicants.map((s) => s.industry).filter(Boolean))].sort(),
    };
  },
});
