import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { authComponent } from "./auth";
import { evaluateApplication } from "./lib/evaluation";
import { APPLICATION_LIMIT } from "./lib/opportunities";

/*
 * The SME side of opportunities: what's open to apply for (Matches), what the SME applied to
 * (Opportunities), and applying. SMEs see buyers as organisations only: never which staff member
 * viewed them, and never other applicants' names.
 */

/** Most open opportunities read for the match feed. */
const FEED_LIMIT = 300;

async function getOwnSme(ctx: QueryCtx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  return ctx.db
    .query("smes")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
}

/** Enterprise organisations by id, with whether YES Hub has verified them. */
async function organizations(ctx: QueryCtx) {
  const list = await ctx.runQuery(components.betterAuth.organizations.list, { limit: 500 });
  return new Map(
    list
      .filter((org) => org.kind === "enterprise")
      .map((org) => [org.id, { name: org.name, verified: org.verificationStatus === "verified" }]),
  );
}

/** The fields the SME portal shows and the eligibility check reads. */
function publicOpportunity(o: Doc<"opportunities">, organizationName: string) {
  return {
    id: o._id,
    kind: o.kind,
    title: o.title,
    reference: o.reference,
    description: o.description,
    industry: o.industry,
    services: o.services,
    provinces: o.provinces,
    minBbbeeLevel: o.minBbbeeLevel,
    requiredDocuments: o.requiredDocuments,
    value: o.value ?? null,
    closesAt: o.closesAt,
    status: o.status,
    organizationName,
    contractPeriod: o.listing?.contractPeriod ?? "",
    publishedAt: o.listing?.publishedAt ?? o._creationTime,
  };
}

/** Where this application ranks among everyone's to the same opportunity, and how many applied. */
async function rankOf(ctx: QueryCtx, application: Doc<"applications">) {
  const all = await ctx.db
    .query("applications")
    .withIndex("by_opportunity", (q) => q.eq("opportunityId", application.opportunityId))
    .take(APPLICATION_LIMIT);
  all.sort(
    (a, b) =>
      Number(b.evaluation.qualifies) - Number(a.evaluation.qualifies) ||
      b.evaluation.score - a.evaluation.score ||
      a.submittedAt - b.submittedAt,
  );
  return { rank: all.findIndex((a) => a._id === application._id) + 1, applicants: all.length };
}

/** How often the buyer's team opened the application, and when they last did. Names stay private. */
async function buyerViews(ctx: QueryCtx, application: Doc<"applications">) {
  const entries = await ctx.db
    .query("applicationActivity")
    .withIndex("by_application", (q) => q.eq("applicationId", application._id))
    .order("desc")
    .take(200);
  const views = entries.filter((e) => e.action === "viewed" || e.action === "document_opened");
  return { views: views.length, lastViewedAt: views[0]?._creationTime ?? null };
}

async function applicationSummary(ctx: QueryCtx, application: Doc<"applications">) {
  return {
    id: application._id,
    status: application.status,
    submittedAt: application.submittedAt,
    statusChangedAt: application.statusChangedAt ?? null,
    evaluation: application.evaluation,
    ...(await rankOf(ctx, application)),
    ...(await buyerViews(ctx, application)),
  };
}

/**
 * Open opportunities from verified enterprises, for the Matches tab, with any application the SME already
 * made. The portal scores fit in the browser with the same rules buyers see (see convex/lib/evaluation.ts).
 */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const sme = await getOwnSme(ctx);
    if (!sme) return null;

    const [orgs, open, mine] = await Promise.all([
      organizations(ctx),
      ctx.db
        .query("opportunities")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .take(FEED_LIMIT),
      ctx.db
        .query("applications")
        .withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", sme._id))
        .take(APPLICATION_LIMIT),
    ]);
    const appliedTo = new Map(mine.map((a) => [a.opportunityId, a]));

    return open
      .filter((o) => orgs.get(o.organizationId)?.verified)
      .map((o) => {
        const application = appliedTo.get(o._id);
        return {
          ...publicOpportunity(o, orgs.get(o.organizationId)!.name),
          application: application ? { id: application._id, status: application.status } : null,
        };
      });
  },
});

/** Everything the SME applied to, newest first, with how each is going. */
export const myApplications = query({
  args: {},
  handler: async (ctx) => {
    const sme = await getOwnSme(ctx);
    if (!sme) return null;

    const [orgs, applications] = await Promise.all([
      organizations(ctx),
      ctx.db
        .query("applications")
        .withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", sme._id))
        .take(APPLICATION_LIMIT),
    ]);

    const rows = [];
    for (const application of applications) {
      const opportunity = await ctx.db.get("opportunities", application.opportunityId);
      if (!opportunity) continue;
      rows.push({
        opportunity: publicOpportunity(opportunity, orgs.get(opportunity.organizationId)?.name ?? "A buyer"),
        application: await applicationSummary(ctx, application),
      });
    }
    rows.sort((a, b) => b.application.submittedAt - a.application.submittedAt);
    return rows;
  },
});

/**
 * One opportunity as an SME sees it: the listing, released documents and the SME's own application.
 * Available while it's open (from a verified buyer), or any time to an SME that applied.
 */
export const opportunity = query({
  args: { opportunityId: v.string() },
  handler: async (ctx, args) => {
    const sme = await getOwnSme(ctx);
    if (!sme) return null;

    const id = ctx.db.normalizeId("opportunities", args.opportunityId);
    const opportunity = id ? await ctx.db.get("opportunities", id) : null;
    if (!opportunity) return null;

    const [orgs, application] = await Promise.all([
      organizations(ctx),
      ctx.db
        .query("applications")
        .withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", sme._id).eq("opportunityId", opportunity._id))
        .unique(),
    ]);
    const org = orgs.get(opportunity.organizationId);
    if (!application && !(opportunity.status === "open" && org?.verified)) return null;

    const released = await ctx.db
      .query("opportunityDocuments")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
      .take(50);
    const documents = [];
    for (const doc of released) {
      documents.push({
        id: doc._id,
        label: doc.label,
        name: doc.name,
        size: doc.size,
        url: await ctx.storage.getUrl(doc.storageId),
      });
    }

    return {
      ...publicOpportunity(opportunity, org?.name ?? "A buyer"),
      listing: opportunity.listing ?? null,
      documents,
      application: application ? await applicationSummary(ctx, application) : null,
    };
  },
});

/** Today as yyyy-mm-dd in South Africa, to compare with closing dates. */
function todayInSouthAfrica() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Applies to an open opportunity. The buyer sees it straight away, checked against their requirements. */
export const apply = mutation({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const sme = await getOwnSme(ctx);
    if (!sme) throw new ConvexError("Register your business before applying.");
    if (sme.suspendedAt) throw new ConvexError("Your profile is suspended, so you can’t apply right now. Contact YES Hub.");

    const opportunity = await ctx.db.get("opportunities", args.opportunityId);
    if (!opportunity || opportunity.status !== "open") throw new ConvexError("This opportunity isn’t open any more.");
    if (opportunity.closesAt < todayInSouthAfrica()) throw new ConvexError("This opportunity has closed.");

    const buyer = await ctx.runQuery(components.betterAuth.organizations.detail, {
      organizationId: opportunity.organizationId,
    });
    if (buyer?.organization.verificationStatus !== "verified") {
      throw new ConvexError("This opportunity isn’t open any more.");
    }

    const existing = await ctx.db
      .query("applications")
      .withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", sme._id).eq("opportunityId", opportunity._id))
      .unique();
    if (existing) throw new ConvexError("You’ve already applied to this opportunity.");

    return ctx.db.insert("applications", {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      smeId: sme._id,
      status: "submitted",
      submittedAt: Date.now(),
      evaluation: evaluateApplication(opportunity, sme),
    });
  },
});
