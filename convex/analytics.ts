import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getEnterprise } from "./enterprise";
import { query } from "./functions";
import { getStaff } from "./lib/staff";

/*
 * Platform analytics for MASLink staff, and the same for one enterprise organisation. Returns compact rows rather than totals: queries shouldn't read the
 * clock, so the browser buckets them into the chosen date range. Capped at hackathon scale.
 */

const LIMIT = 5000;

export const platform = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getStaff(ctx, { user: ["list"] }))) return null;

    const [users, smes, opportunities, applications, commands] = await Promise.all([
      ctx.runQuery(components.betterAuth.users.listUsers, { limit: LIMIT }),
      ctx.db.query("smes").order("desc").take(LIMIT),
      ctx.db.query("opportunities").order("desc").take(LIMIT),
      ctx.db.query("applications").order("desc").take(LIMIT),
      ctx.db.query("commands").order("desc").take(LIMIT),
    ]);
    const smeById = new Map(smes.map((s) => [s._id, s]));
    const provinceByUser = new Map(smes.map((s) => [s.userId, s.hqProvince]));
    const kindById = new Map(opportunities.map((o) => [o._id, o.kind]));

    return {
      users: users.map((u) => u.createdAt),
      smes: smes.map((s) => ({
        t: s._creationTime,
        province: s.hqProvince,
        industry: s.industry,
        bbbee: s.bbbeeLevel,
        verified: !!s.verifiedAt,
      })),
      opportunities: opportunities.map((o) => ({
        t: o.listing?.publishedAt ?? o._creationTime,
        kind: o.kind,
        status: o.status,
        /** Empty means nationwide. */
        provinces: o.provinces,
        value: o.value ?? null,
      })),
      applications: applications.map((a) => ({
        t: a.submittedAt,
        status: a.status,
        province: smeById.get(a.smeId)?.hqProvince ?? null,
        kind: kindById.get(a.opportunityId) ?? null,
        score: a.evaluation.score,
        qualifies: a.evaluation.qualifies,
        review: a.decision?.outcome ?? null,
        overridden: !!a.decision?.overriddenBy,
        /** Days from applying to the buyer's latest decision. */
        decidedAfter: a.statusChangedAt ? (a.statusChangedAt - a.submittedAt) / 86_400_000 : null,
      })),
      // Changes people made (not the system), placed by the SME's head office where the actor is an SME
      activity: commands
        .filter((c) => c.visibility === "public" && c.actorId)
        .map((c) => ({ t: c._creationTime, province: provinceByUser.get(c.actorId!) ?? null })),
    };
  },
});

/**
 * The same figures for one enterprise organisation: its listings, the applications they received, and the
 * SMEs that applied (dated by their first application to it). Shaped like `platform`, so one report reads both.
 */
export const organisation = query({
  args: {},
  handler: async (ctx) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;
    const organizationId = enterprise.organization.id;

    const [opportunities, applications, commands] = await Promise.all([
      ctx.db
        .query("opportunities")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .take(LIMIT),
      ctx.db
        .query("applications")
        .withIndex("by_organization_and_status", (q) => q.eq("organizationId", organizationId))
        .take(LIMIT),
      ctx.db
        .query("commands")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .order("desc")
        .take(LIMIT),
    ]);
    const firstApplied = new Map<string, number>();
    for (const a of applications) {
      firstApplied.set(a.smeId, Math.min(firstApplied.get(a.smeId) ?? Infinity, a.submittedAt));
    }
    const smes = (await Promise.all([...firstApplied.keys()].map((id) => ctx.db.get("smes", id as Id<"smes">)))).filter(
      (s): s is Doc<"smes"> => s !== null,
    );
    const smeById = new Map(smes.map((s) => [s._id as string, s]));
    const kindById = new Map(opportunities.map((o) => [o._id as string, o.kind]));
    const provinceByUser = new Map(smes.map((s) => [s.userId, s.hqProvince]));

    return {
      users: [] as number[],
      smes: smes.map((s) => ({
        t: firstApplied.get(s._id)!,
        province: s.hqProvince,
        industry: s.industry,
        bbbee: s.bbbeeLevel,
        verified: !!s.verifiedAt,
      })),
      opportunities: opportunities.map((o) => ({
        t: o.listing?.publishedAt ?? o._creationTime,
        kind: o.kind,
        status: o.status,
        provinces: o.provinces,
        value: o.value ?? null,
      })),
      applications: applications.map((a) => ({
        t: a.submittedAt,
        status: a.status,
        province: smeById.get(a.smeId)?.hqProvince ?? null,
        kind: kindById.get(a.opportunityId) ?? null,
        score: a.evaluation.score,
        qualifies: a.evaluation.qualifies,
        review: a.decision?.outcome ?? null,
        overridden: !!a.decision?.overriddenBy,
        decidedAfter: a.statusChangedAt ? (a.statusChangedAt - a.submittedAt) / 86_400_000 : null,
      })),
      // What the organisation's people and its applicants did to its records, placed by the applicant's province
      activity: commands
        .filter((c) => c.visibility === "public" && c.actorId)
        .map((c) => ({ t: c._creationTime, province: provinceByUser.get(c.actorId!) ?? null })),
    };
  },
});
