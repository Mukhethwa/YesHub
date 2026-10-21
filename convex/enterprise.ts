import { ConvexError, v } from "convex/values";

import { getSettings } from "../src/lib/sme/settings";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { organizationsFor } from "./account";
import { authComponent } from "./auth";
import { evaluateApplication } from "./lib/evaluation";
import type { ActivityAction, DocKey, DocRef } from "./schema";
import {
  APPLICATION_LIMIT,
  deleteOpportunitiesForOrganization,
  insertSampleOpportunities,
  TENDER_DOC_MAX_MB,
  TENDER_DOC_MIME_TYPES,
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
        statusChangedAt: application.statusChangedAt ?? null,
        statusChangedBy: application.statusChangedBy ?? null,
        lastViewed: await lastViewOf(ctx, application._id),
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

    const releasedDocuments = await ctx.db
      .query("opportunityDocuments")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
      .take(50);
    const documents = [];
    for (const doc of releasedDocuments) {
      documents.push({
        id: doc._id,
        label: doc.label,
        name: doc.name,
        size: doc.size,
        type: doc.type,
        uploadedAt: doc._creationTime,
        uploadedBy: doc.uploadedBy,
        url: await ctx.storage.getUrl(doc.storageId),
      });
    }

    return {
      ...summarize(opportunity, applications),
      description: opportunity.description,
      services: opportunity.services,
      minBbbeeLevel: opportunity.minBbbeeLevel ?? null,
      requiredDocuments: opportunity.requiredDocuments,
      listing: opportunity.listing ?? null,
      documents,
      applicants,
    };
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Shortlisting                                                                                           */
/* ------------------------------------------------------------------------------------------------------ */

/** Shortlists, declines or resets an applicant to one of the organisation's opportunities. */
export const setApplicationStatus = mutation({
  args: {
    applicationId: v.id("applications"),
    status: v.union(v.literal("submitted"), v.literal("shortlisted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) throw new ConvexError("You need an organisation to review applicants.");
    const application = await ctx.db.get("applications", args.applicationId);
    if (!application || application.organizationId !== enterprise.organization.id) {
      throw new ConvexError("That application isn’t available.");
    }
    if (application.status === "awarded") throw new ConvexError("This application has already been awarded.");

    await ctx.db.patch("applications", application._id, {
      status: args.status,
      statusChangedAt: Date.now(),
      statusChangedBy: enterprise.user.name,
    });
    const action =
      args.status === "shortlisted" ? "shortlisted" : args.status === "declined" ? "declined" : "unshortlisted";
    await recordActivity(ctx, application, enterprise.user, action);
    return null;
  },
});

/** Every SME the organisation has shortlisted, across all its opportunities, most recent first. */
export const shortlist = query({
  args: {},
  handler: async (ctx) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;

    const applications = await ctx.db
      .query("applications")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", enterprise.organization.id).eq("status", "shortlisted"),
      )
      .take(APPLICATION_LIMIT);

    const rows = [];
    for (const application of applications) {
      const [opportunity, sme] = await Promise.all([
        ctx.db.get("opportunities", application.opportunityId),
        ctx.db.get("smes", application.smeId),
      ]);
      if (!opportunity || !sme) continue;
      rows.push({
        applicationId: application._id,
        shortlistedAt: application.statusChangedAt ?? application.submittedAt,
        shortlistedBy: application.statusChangedBy ?? null,
        score: application.evaluation.score,
        qualifies: application.evaluation.qualifies,
        opportunity: {
          id: opportunity._id,
          title: opportunity.title,
          reference: opportunity.reference,
          kind: opportunity.kind,
          closesAt: opportunity.closesAt,
          status: opportunity.status,
        },
        // Shortlisting is when SMEs agree to share contact details
        sme: { ...supplierSummary(sme), ...contactOf(sme) },
      });
    }
    rows.sort((a, b) => b.shortlistedAt - a.shortlistedAt);
    return rows;
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Activity: who viewed, shortlisted or opened what                                                       */
/* ------------------------------------------------------------------------------------------------------ */

/** Repeat views by the same person within this window are one view. */
const VIEW_WINDOW_MS = 10 * 60 * 1000;

async function recordActivity(
  ctx: MutationCtx,
  application: Doc<"applications">,
  actor: { _id: string; name: string },
  action: ActivityAction,
  detail?: string,
) {
  if (action === "viewed") {
    const recent = await ctx.db
      .query("applicationActivity")
      .withIndex("by_application", (q) => q.eq("applicationId", application._id))
      .order("desc")
      .take(20);
    const sameView = recent.find((e) => e.action === "viewed" && e.actorId === actor._id);
    if (sameView && Date.now() - sameView._creationTime < VIEW_WINDOW_MS) return;
  }
  await ctx.db.insert("applicationActivity", {
    applicationId: application._id,
    opportunityId: application.opportunityId,
    organizationId: application.organizationId,
    actorId: actor._id,
    actorName: actor.name,
    action,
    detail,
  });
}

/** Who in the organisation last looked at an application, and when. */
async function lastViewOf(ctx: QueryCtx, applicationId: Id<"applications">) {
  const recent = await ctx.db
    .query("applicationActivity")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .order("desc")
    .take(25);
  const view = recent.find((e) => e.action === "viewed");
  return view ? { by: view.actorName, at: view._creationTime } : null;
}

function activityRow(entry: Doc<"applicationActivity">) {
  return {
    id: entry._id,
    at: entry._creationTime,
    actorName: entry.actorName,
    action: entry.action,
    detail: entry.detail ?? null,
    applicationId: entry.applicationId,
  };
}

/** Records that someone in the organisation opened an application. */
export const recordApplicationView = mutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    const application = await ctx.db.get("applications", args.applicationId);
    if (!enterprise || !application || application.organizationId !== enterprise.organization.id) return null;
    await recordActivity(ctx, application, enterprise.user, "viewed");
    return null;
  },
});

/**
 * Records that someone opened one of an SME's documents. Logged on the application to the opportunity they
 * came from, or the SME's most recent application to the organisation.
 */
export const recordDocumentOpened = mutation({
  args: { smeId: v.id("smes"), opportunityId: v.optional(v.id("opportunities")), document: v.string() },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;
    const applications = (
      await ctx.db
        .query("applications")
        .withIndex("by_sme_and_opportunity", (q) =>
          args.opportunityId ? q.eq("smeId", args.smeId).eq("opportunityId", args.opportunityId) : q.eq("smeId", args.smeId),
        )
        .take(APPLICATION_LIMIT)
    ).filter((a) => a.organizationId === enterprise.organization.id);
    const application = applications.sort((a, b) => b.submittedAt - a.submittedAt)[0];
    if (application) await recordActivity(ctx, application, enterprise.user, "document_opened", args.document);
    return null;
  },
});

/** One application's activity, newest first. */
export const applicationActivity = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    const application = await ctx.db.get("applications", args.applicationId);
    if (!enterprise || !application || application.organizationId !== enterprise.organization.id) return null;
    const entries = await ctx.db
      .query("applicationActivity")
      .withIndex("by_application", (q) => q.eq("applicationId", application._id))
      .order("desc")
      .take(200);
    return entries.map(activityRow);
  },
});

/** Activity across every application to one opportunity, newest first, with the SME each is about. */
export const opportunityActivity = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    const opportunity = await ctx.db.get("opportunities", args.opportunityId);
    if (!enterprise || !opportunity || opportunity.organizationId !== enterprise.organization.id) return null;

    const entries = await ctx.db
      .query("applicationActivity")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
      .order("desc")
      .take(200);
    const companies = new Map<string, string>();
    for (const entry of entries) {
      if (companies.has(entry.applicationId)) continue;
      const application = await ctx.db.get("applications", entry.applicationId);
      const sme = application ? await ctx.db.get("smes", application.smeId) : null;
      companies.set(entry.applicationId, sme?.companyName ?? "Removed business");
    }
    return entries.map((entry) => ({ ...activityRow(entry), companyName: companies.get(entry.applicationId)! }));
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Documents released with an opportunity                                                                 */
/* ------------------------------------------------------------------------------------------------------ */

async function ownOpportunity(ctx: QueryCtx, opportunityId: Id<"opportunities">) {
  const enterprise = await getEnterprise(ctx);
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (!enterprise || !opportunity || opportunity.organizationId !== enterprise.organization.id) {
    throw new ConvexError("That opportunity isn’t available.");
  }
  return { enterprise, opportunity };
}

/** Attaches an uploaded file (see smes:generateUploadUrl) to an opportunity as a released document. */
export const addOpportunityDocument = mutation({
  args: {
    opportunityId: v.id("opportunities"),
    label: v.string(),
    file: v.object({ storageId: v.id("_storage"), name: v.string() }),
  },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    const meta = await ctx.db.system.get("_storage", args.file.storageId);
    if (!meta) throw new ConvexError(`Couldn’t find the upload for ${args.file.name}. Please try again.`);

    const problem =
      meta.size > TENDER_DOC_MAX_MB * 1024 * 1024
        ? `${args.file.name} is larger than ${TENDER_DOC_MAX_MB} MB`
        : !TENDER_DOC_MIME_TYPES.includes(meta.contentType ?? "")
          ? `${args.file.name} isn’t a PDF, Word, Excel or image file`
          : null;
    if (problem) {
      await ctx.storage.delete(args.file.storageId);
      throw new ConvexError(problem);
    }

    await ctx.db.insert("opportunityDocuments", {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      storageId: args.file.storageId,
      label: args.label.trim().slice(0, 80) || "Document",
      name: args.file.name.slice(0, 200),
      size: meta.size,
      type: meta.contentType!,
      uploadedBy: enterprise.user.name,
    });
    return null;
  },
});

export const removeOpportunityDocument = mutation({
  args: { documentId: v.id("opportunityDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get("opportunityDocuments", args.documentId);
    if (!doc) return null;
    await ownOpportunity(ctx, doc.opportunityId);
    await ctx.storage.delete(doc.storageId);
    await ctx.db.delete("opportunityDocuments", doc._id);
    return null;
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Suppliers                                                                                              */
/* ------------------------------------------------------------------------------------------------------ */

/** Most SME profiles the supplier directory reads. */
const SUPPLIER_LIMIT = 300;

function supplierSummary(sme: Doc<"smes">) {
  return {
    id: sme._id,
    companyName: sme.companyName,
    industry: sme.industry,
    city: sme.city,
    hqProvince: sme.hqProvince,
    nationwide: sme.nationwide,
    provinces: sme.provinces,
    services: sme.services,
    bbbeeLevel: sme.bbbeeLevel,
    verified: !!sme.verifiedAt,
  };
}

function contactOf(sme: Doc<"smes">) {
  return { contactName: sme.contactName, contactRole: sme.contactRole, email: sme.email, phone: sme.phone };
}

/** What the document check needs: which documents are on file and the two expiry dates. */
function documentState(sme: Doc<"smes">) {
  return {
    documentKeys: Object.entries(sme.documents)
      .filter(([, doc]) => !!doc)
      .map(([key]) => key),
    bbbeeExpiry: sme.bbbeeExpiry,
    taxExpiry: sme.taxExpiry,
  };
}

/** How many times each SME has applied to the organisation's opportunities. */
async function applicationCountsFor(ctx: QueryCtx, organizationId: string) {
  const counts = new Map<string, number>();
  const applications = await ctx.db
    .query("applications")
    .withIndex("by_organization_and_status", (q) => q.eq("organizationId", organizationId))
    .take(2000);
  for (const a of applications) counts.set(a.smeId, (counts.get(a.smeId) ?? 0) + 1);
  return counts;
}

/**
 * The supplier directory: SMEs that let corporates see their profile, and any that applied to this
 * organisation. Suspended SMEs are left out unless they applied.
 */
export const suppliers = query({
  args: {},
  handler: async (ctx) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;

    const [smes, applied] = await Promise.all([
      ctx.db.query("smes").order("desc").take(SUPPLIER_LIMIT),
      applicationCountsFor(ctx, enterprise.organization.id),
    ]);
    return smes
      .filter((sme) => applied.has(sme._id) || (getSettings(sme).profileVisible && !sme.suspendedAt))
      .map((sme) => ({
        ...supplierSummary(sme),
        ...documentState(sme),
        applications: applied.get(sme._id) ?? 0,
      }));
  },
});

/**
 * One supplier's full profile for the organisation. Documents can be opened only when the SME applied to
 * one of the organisation's opportunities (that's when it submitted them); contact details follow the
 * SME's own setting, which by default shares them once the organisation shortlists it.
 */
export const supplier = query({
  args: { smeId: v.string() },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) return null;

    const id = ctx.db.normalizeId("smes", args.smeId);
    const sme = id ? await ctx.db.get("smes", id) : null;
    if (!sme) return null;

    const ours = (
      await ctx.db
        .query("applications")
        .withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", sme._id))
        .take(APPLICATION_LIMIT)
    ).filter((a) => a.organizationId === enterprise.organization.id);

    const settings = getSettings(sme);
    const applied = ours.length > 0;
    // A hidden or suspended profile looks the same as one that doesn't exist, unless it applied to you
    if (!applied && (!settings.profileVisible || sme.suspendedAt)) return null;

    const shortlisted = ours.some((a) => a.status === "shortlisted" || a.status === "awarded");
    const contactVisible = !settings.shareContactAfterShortlist || shortlisted;

    const history = [];
    for (const application of ours) {
      const opportunity = await ctx.db.get("opportunities", application.opportunityId);
      if (!opportunity) continue;
      history.push({
        applicationId: application._id,
        opportunityId: opportunity._id,
        title: opportunity.title,
        reference: opportunity.reference,
        kind: opportunity.kind,
        status: application.status,
        submittedAt: application.submittedAt,
        qualifies: application.evaluation.qualifies,
        score: application.evaluation.score,
        summary: application.evaluation.summary,
      });
    }
    history.sort((a, b) => b.submittedAt - a.submittedAt);

    const documents = [];
    for (const [key, doc] of Object.entries(sme.documents) as [DocKey, DocRef | undefined][]) {
      if (!doc) continue;
      documents.push({
        key,
        name: doc.name,
        size: doc.size,
        uploadedAt: doc.uploadedAt,
        // Signed links only for SMEs that submitted their documents to this organisation
        url: applied && doc.storageId ? await ctx.storage.getUrl(doc.storageId) : null,
      });
    }

    return {
      ...supplierSummary(sme),
      registrationNumber: sme.registrationNumber,
      csdNumber: sme.csdNumber,
      yearsTrading: sme.yearsTrading,
      employees: sme.employees,
      address: sme.address,
      serviceAreas: sme.serviceAreas,
      capabilities: sme.capabilities,
      accreditations: sme.accreditations,
      website: sme.website,
      bbbeeExpiry: sme.bbbeeExpiry,
      taxExpiry: sme.taxExpiry,
      memberSince: sme._creationTime,
      verifiedAt: sme.verifiedAt ?? null,
      suspended: !!sme.suspendedAt,
      organizationName: enterprise.organization.name,
      canViewDocuments: applied,
      documents,
      contact: contactVisible ? contactOf(sme) : null,
      history,
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
