import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { authComponent } from "./auth";
import { evaluateApplication } from "./lib/evaluation";
import { APPLICATION_LIMIT } from "./lib/opportunities";
import { classifyCriteria } from "./lib/procurement";
import { addTrail, MAX_ATTACHMENTS, startReview } from "./review";
import type { ApplicationAttachment } from "./schema";

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

/** Enterprise organisations by id, with whether MASLink has verified them. */
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
    /** Whether the buyer scores price, so applying asks for a quote. */
    scoresPrice: classifyCriteria(o.listing?.evaluationCriteria ?? []).some((c) => c.kind === "price"),
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
    statusReason: application.statusReason ?? null,
    evaluation: application.evaluation,
    review: application.review ? { status: application.review.status } : null,
    // The SME sees its own outcome and why, never other applicants' details
    decision: application.decision
      ? {
          outcome: application.decision.outcome,
          rationale: application.decision.rationale,
          eligible: application.decision.eligible,
          totalPoints: application.decision.totalPoints ?? null,
          decidedAt: application.decision.decidedAt,
        }
      : null,
    quote: application.quote ?? null,
    proposal: application.proposal ?? null,
    attachments: (application.attachments ?? []).map((a) => ({ label: a.label, name: a.name })),
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
      // Applicants see why the buyer withdrew it, but not who did
      cancellation: opportunity.cancellation
        ? { reason: opportunity.cancellation.reason, at: opportunity.cancellation.at }
        : null,
      // The tender's requirements, once the buyer has confirmed them: what the SME is checked against
      tender:
        opportunity.tender?.status === "confirmed"
          ? {
              requirements: opportunity.tender.requirements,
              threshold: opportunity.tender.threshold ?? null,
              documentName: opportunity.tender.documentName ?? null,
            }
          : null,
      documents,
      application: application ? await applicationSummary(ctx, application) : null,
    };
  },
});

/** Longest proposal an SME can send with an application. */
const PROPOSAL_MAX_CHARS = 4000;
const ATTACHMENT_MAX_MB = 10;
/** Jev reads PDFs and images, so those are what applications accept. */
const ATTACHMENT_TYPES = ["application/pdf", "image/png", "image/jpeg"];

/** Checks files sent with an application and turns them into stored references. Rejects the lot on a problem. */
async function checkAttachments(
  ctx: MutationCtx,
  files: { storageId: Id<"_storage">; label: string; name: string }[],
): Promise<ApplicationAttachment[]> {
  const discard = () => Promise.all(files.map((f) => ctx.storage.delete(f.storageId).catch(() => {})));
  if (files.length > MAX_ATTACHMENTS) {
    await discard();
    throw new ConvexError(`Send at most ${MAX_ATTACHMENTS} documents with an application.`);
  }
  const result: ApplicationAttachment[] = [];
  for (const file of files) {
    const meta = await ctx.db.system.get("_storage", file.storageId);
    const problem = !meta
      ? `Couldn’t find the upload for ${file.name}. Please try again.`
      : meta.size > ATTACHMENT_MAX_MB * 1024 * 1024
        ? `${file.name} is larger than ${ATTACHMENT_MAX_MB} MB`
        : !ATTACHMENT_TYPES.includes(meta.contentType ?? "")
          ? `${file.name} isn’t a PDF, JPG or PNG file`
          : !file.label.trim()
            ? `Say what ${file.name} is`
            : null;
    if (problem || !meta) {
      await discard();
      throw new ConvexError(problem ?? "Upload failed.");
    }
    result.push({
      storageId: file.storageId,
      label: file.label.trim().slice(0, 100),
      name: file.name.slice(0, 200),
      size: meta.size,
      type: meta.contentType!,
    });
  }
  return result;
}

/** Today as yyyy-mm-dd in South Africa, to compare with closing dates. */
function todayInSouthAfrica() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Applies to an open opportunity. The buyer sees it straight away, checked against their requirements. */
export const apply = mutation({
  args: {
    opportunityId: v.id("opportunities"),
    /** Quoted price in rand, for opportunities that score price. */
    quote: v.optional(v.number()),
    proposal: v.optional(v.string()),
    /** Files the browser already uploaded to Convex storage. */
    attachments: v.optional(v.array(v.object({ storageId: v.id("_storage"), label: v.string(), name: v.string() }))),
  },
  handler: async (ctx, args) => {
    const sme = await getOwnSme(ctx);
    if (!sme) throw new ConvexError("Register your business before applying.");
    if (sme.suspendedAt)
      throw new ConvexError("Your profile is suspended, so you can’t apply right now. Contact MASLink.");

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

    const quote = args.quote === undefined ? undefined : Math.round(args.quote * 100) / 100;
    if (quote !== undefined && !(quote > 0 && quote < 1e12)) throw new ConvexError("Enter your quoted price in rand.");
    const proposal = args.proposal?.trim().slice(0, PROPOSAL_MAX_CHARS) || undefined;
    const attachments = await checkAttachments(ctx, args.attachments ?? []);

    const applicationId = await ctx.db.insert("applications", {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      smeId: sme._id,
      status: "submitted",
      submittedAt: Date.now(),
      // MASLink's rules answer straight away; Jev replaces this once it has read the documents
      evaluation: evaluateApplication(opportunity, sme),
      quote,
      proposal,
      attachments,
    });
    await addTrail(ctx, {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      applicationId,
      kind: "submitted",
      actor: sme.companyName,
      summary: `${sme.companyName} applied${quote !== undefined ? ` with a quote of R${quote.toLocaleString("en-ZA")}` : ""}${attachments.length ? ` and ${attachments.length} document${attachments.length === 1 ? "" : "s"}` : ""}.`,
      details: attachments.map((a) => `${a.label}: ${a.name}`),
    });
    await startReview(ctx, applicationId);
    return applicationId;
  },
});

/**
 * Adds documents to an application while the opportunity is still open, so an SME can supply what the review
 * said was missing. The application is reviewed again with everything it now holds.
 */
export const addDocuments = mutation({
  args: {
    applicationId: v.id("applications"),
    attachments: v.array(v.object({ storageId: v.id("_storage"), label: v.string(), name: v.string() })),
    /** Earlier files to drop, by position, e.g. an unsigned form being replaced. */
    remove: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const discard = () => Promise.all(args.attachments.map((f) => ctx.storage.delete(f.storageId).catch(() => {})));
    const sme = await getOwnSme(ctx);
    const application = await ctx.db.get("applications", args.applicationId);
    if (!sme || !application || application.smeId !== sme._id) {
      await discard();
      throw new ConvexError("That application isn’t available.");
    }
    const opportunity = await ctx.db.get("opportunities", application.opportunityId);
    const problem =
      !opportunity || opportunity.status !== "open" || opportunity.closesAt < todayInSouthAfrica()
        ? "This opportunity has closed, so the application can’t change."
        : application.status !== "submitted" || application.decision
          ? "The buyer has already decided on this application."
          : null;
    if (problem || !opportunity) {
      await discard();
      throw new ConvexError(problem ?? "This opportunity has closed.");
    }

    const removed = new Set(args.remove ?? []);
    const kept = (application.attachments ?? []).filter((_, i) => !removed.has(i));
    if (kept.length + args.attachments.length > MAX_ATTACHMENTS) {
      await discard();
      throw new ConvexError(`An application holds at most ${MAX_ATTACHMENTS} documents. Remove one to make room.`);
    }
    const added = await checkAttachments(ctx, args.attachments);
    const dropped = (application.attachments ?? []).filter((_, i) => removed.has(i));
    await Promise.all(dropped.map((f) => ctx.storage.delete(f.storageId).catch(() => {})));

    await ctx.db.patch("applications", application._id, {
      attachments: [...kept, ...added],
      evaluation: evaluateApplication(opportunity, sme),
    });
    await addTrail(ctx, {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      applicationId: application._id,
      kind: "submitted",
      actor: sme.companyName,
      summary: `${sme.companyName} updated its application${added.length ? `, adding ${added.length} document${added.length === 1 ? "" : "s"}` : ""}${dropped.length ? `${added.length ? " and" : ","} removing ${dropped.length}` : ""}.`,
      details: [
        ...added.map((a) => `Added ${a.label}: ${a.name}`),
        ...dropped.map((a) => `Removed ${a.label}: ${a.name}`),
      ],
    });
    await startReview(ctx, application._id);
    return null;
  },
});
