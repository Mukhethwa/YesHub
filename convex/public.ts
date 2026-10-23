import { v } from "convex/values";

import { query } from "./functions";

/*
 * Figures for the public landing page. Counts only: nothing here identifies a business or a person.
 */

const LIMIT = 2000;

/** Registered SMEs and open opportunities by province. Opportunities with no provinces are nationwide. */
export const coverage = query({
  args: {},
  returns: v.object({
    provinces: v.array(v.object({ province: v.string(), smes: v.number(), opportunities: v.number() })),
    nationwide: v.number(),
    openOpportunities: v.number(),
    openValue: v.number(),
    smeCount: v.number(),
  }),
  handler: async (ctx) => {
    const [smes, open] = await Promise.all([
      ctx.db.query("smes").take(LIMIT),
      ctx.db
        .query("opportunities")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .take(LIMIT),
    ]);
    const listed = smes.filter((s) => !s.suspendedAt && (s.settings?.profileVisible ?? true));

    const bySme: Record<string, number> = {};
    for (const s of listed) if (s.hqProvince) bySme[s.hqProvince] = (bySme[s.hqProvince] ?? 0) + 1;
    const byOpportunity: Record<string, number> = {};
    for (const o of open) for (const p of o.provinces) byOpportunity[p] = (byOpportunity[p] ?? 0) + 1;

    return {
      provinces: [...new Set([...Object.keys(bySme), ...Object.keys(byOpportunity)])].map((province) => ({
        province,
        smes: bySme[province] ?? 0,
        opportunities: byOpportunity[province] ?? 0,
      })),
      nationwide: open.filter((o) => o.provinces.length === 0).length,
      openOpportunities: open.length,
      openValue: open.reduce((sum, o) => sum + (o.value ?? 0), 0),
      smeCount: listed.length,
    };
  },
});
