import { components } from "./_generated/api";
import { query } from "./functions";
import { isEsd } from "./lib/kinds";
import { getStaff } from "./lib/staff";

/*
 * Platform analytics for MASLink staff. Returns compact rows rather than totals: queries shouldn't read the
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
    // Drafts were never published, so they aren't opportunities yet
    const published = opportunities.filter((o) => o.status !== "draft");
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
      opportunities: published.map((o) => ({
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
        /** An ESD programme (grant, funding, accelerator, support): "awarded" means accepted into it. */
        esd: isEsd(kindById.get(a.opportunityId) ?? "tender"),
        score: a.evaluation.score,
        qualifies: a.evaluation.qualifies,
        review: a.decision?.outcome ?? null,
        overridden: !!a.decision?.overriddenBy,
        /** Days from applying to the buyer's latest decision. A withdrawal is the SME's doing, not a decision. */
        decidedAfter:
          a.statusChangedAt && a.status !== "withdrawn" ? (a.statusChangedAt - a.submittedAt) / 86_400_000 : null,
      })),
      // Changes people made (not the system), placed by the SME's head office where the actor is an SME
      activity: commands
        .filter((c) => c.visibility === "public" && c.actorId)
        .map((c) => ({ t: c._creationTime, province: provinceByUser.get(c.actorId!) ?? null })),
    };
  },
});
