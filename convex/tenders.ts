import { ConvexError, type Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { ownOpportunity } from "./enterprise";
import { internalMutation, internalQuery, mutation } from "./functions";
import { type AuditChange, auditValue, recordAudit } from "./lib/audit";
import { APPLICATION_LIMIT } from "./lib/opportunities";
import { addTrail, startReview } from "./review";
import { tenderRequirement, type TenderRequirement } from "./schema";

/*
 * A tender's requirements register: Jev reads the buyer's tender document into mandatory requirements,
 * scored criteria, returnable documents and key conditions (tenderActions.ts), the buyer checks and edits
 * the list, then confirms it. From then on every application is checked against each requirement, so the
 * SME sees what it still needs and the buyer sees who has what.
 */

/** How the tender reading appears on the trail, like the application review. */
const READER = "Automated review";
/** Most requirements one register holds. A long tender has 40 or so. */
const MAX_REQUIREMENTS = 120;

/** Has Jev read one of the opportunity's released PDFs into a draft register. Replaces any earlier reading. */
export const readTender = mutation({
  args: { opportunityId: v.id("opportunities"), documentId: v.id("opportunityDocuments") },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    const document = await ctx.db.get("opportunityDocuments", args.documentId);
    if (!document || document.opportunityId !== opportunity._id)
      throw new ConvexError("That document isn’t available.");
    if (document.type !== "application/pdf") throw new ConvexError("Requirements can only be read from a PDF.");
    if (opportunity.tender?.status === "reading") throw new ConvexError("The tender is already being read.");

    await ctx.db.patch("opportunities", opportunity._id, {
      tender: {
        // The earlier list stays visible until the new reading replaces it
        requirements: opportunity.tender?.requirements ?? [],
        threshold: opportunity.tender?.threshold,
        gaps: [],
        status: "reading",
        documentId: document._id,
        documentName: document.name,
        readBy: enterprise.user.name,
      },
    });
    await ctx.scheduler.runAfter(0, internal.tenderActions.readTender, { opportunityId: opportunity._id });
    await auditTender(ctx, enterprise, opportunity, "tender.read", {
      summary: `${enterprise.user.name} had ${document.name} read into the tender requirements for ${opportunity.reference}.`,
    });
    return null;
  },
});

/** Tender requirements decide who qualifies, so every change to them is on the organisation's audit log. */
async function auditTender(
  ctx: MutationCtx,
  enterprise: { user: { _id: string; name: string } },
  opportunity: Doc<"opportunities">,
  action: string,
  entry: { summary: string; changes?: AuditChange[] },
) {
  await recordAudit(ctx, {
    organizationId: opportunity.organizationId,
    actorId: enterprise.user._id,
    actorName: enterprise.user.name,
    action,
    opportunityId: opportunity._id,
    targetLabel: `${opportunity.reference}: ${opportunity.title}`,
    ...entry,
  });
}

/** The document a reading was asked for. */
export const readInput = internalQuery({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const opportunity = await ctx.db.get("opportunities", args.opportunityId);
    const documentId = opportunity?.tender?.status === "reading" ? opportunity.tender.documentId : undefined;
    const document = documentId ? await ctx.db.get("opportunityDocuments", documentId) : null;
    return document ? { storageId: document.storageId, name: document.name, title: opportunity!.title } : null;
  },
});

const vDraft = v.object({
  kind: tenderRequirement.fields.kind,
  text: v.string(),
  points: v.optional(v.number()),
  scoring: v.optional(v.array(v.string())),
  items: v.optional(v.array(v.string())),
  action: tenderRequirement.fields.action,
  tier: tenderRequirement.fields.tier,
  page: v.number(),
});

export const saveReading = internalMutation({
  args: {
    opportunityId: v.id("opportunities"),
    requirements: v.array(vDraft),
    threshold: v.optional(v.number()),
    gaps: v.array(v.string()),
    model: v.string(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const opportunity = await ctx.db.get("opportunities", args.opportunityId);
    if (opportunity?.tender?.status !== "reading") return null;
    const requirements: TenderRequirement[] = args.requirements
      .slice(0, MAX_REQUIREMENTS)
      .map((r, i) => ({ ...r, id: `r${i + 1}`, source: "tender" as const }));
    await ctx.db.patch("opportunities", opportunity._id, {
      tender: {
        ...opportunity.tender,
        status: "draft",
        requirements,
        threshold: args.threshold,
        gaps: args.gaps,
        error: undefined,
        readAt: Date.now(),
        confirmedAt: undefined,
        confirmedBy: undefined,
        model: args.model,
      },
    });
    const count = (kind: TenderRequirement["kind"]) => requirements.filter((r) => r.kind === kind).length;
    await addTrail(ctx, {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      kind: "tender",
      actor: READER,
      summary: `Read ${opportunity.tender.documentName ?? "the tender"}: ${count("mandatory")} mandatory requirements, ${count("scored")} scored criteria, ${count("returnable")} returnable documents and ${count("condition")} conditions. Waiting for the buyer to confirm.`,
      details: args.gaps.map((g) => `Gap in the tender: ${g}`),
      model: args.model,
      costUsd: args.costUsd,
    });
    return null;
  },
});

export const readingFailed = internalMutation({
  args: { opportunityId: v.id("opportunities"), error: v.string() },
  handler: async (ctx, args) => {
    const opportunity = await ctx.db.get("opportunities", args.opportunityId);
    if (opportunity?.tender?.status !== "reading") return null;
    await ctx.db.patch("opportunities", opportunity._id, {
      tender: {
        ...opportunity.tender,
        // Back to what the buyer had: a confirmed list stays confirmed
        status: opportunity.tender.confirmedAt
          ? "confirmed"
          : opportunity.tender.requirements.length
            ? "draft"
            : "failed",
        error: args.error.slice(0, 500),
      },
    });
    return null;
  },
});

/** Requirements as the buyer edits them. Ids are kept so earlier results still line up. */
const vEdited = v.object({
  id: v.optional(v.string()),
  kind: tenderRequirement.fields.kind,
  text: v.string(),
  points: v.optional(v.number()),
  scoring: v.optional(v.array(v.string())),
  items: v.optional(v.array(v.string())),
  action: tenderRequirement.fields.action,
  tier: tenderRequirement.fields.tier,
});

function cleanRequirements(previous: TenderRequirement[], edited: Infer<typeof vEdited>[]) {
  const before = new Map(previous.map((r) => [r.id, r]));
  let next = previous.reduce((max, r) => Math.max(max, Number(r.id.slice(1)) || 0), 0);
  const seen = new Set<string>();
  const clean = (list?: string[]) =>
    list
      ?.map((s) => s.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 30);
  return edited.slice(0, MAX_REQUIREMENTS).flatMap((r): TenderRequirement[] => {
    const text = r.text.trim().slice(0, 600);
    if (!text) return [];
    const old = r.id && !seen.has(r.id) ? before.get(r.id) : undefined;
    const id = old?.id ?? `r${++next}`;
    seen.add(id);
    if (r.points !== undefined && !(r.points >= 0 && r.points <= 1000))
      throw new ConvexError("Points must be between 0 and 1000.");
    return [
      {
        id,
        kind: r.kind,
        text,
        points: r.kind === "scored" ? r.points : undefined,
        scoring: r.kind === "scored" ? clean(r.scoring) : undefined,
        items: r.kind === "scored" ? clean(r.items) : undefined,
        action: r.kind === "returnable" ? (r.action ?? "submit") : undefined,
        tier: r.kind === "returnable" ? r.tier : undefined,
        page: old?.page,
        // A requirement the buyer reworded is still the tender's; one they added is theirs
        source: old?.source ?? "buyer",
      },
    ];
  });
}

/** Saves the buyer's edits. A confirmed register goes back to draft until it's confirmed again. */
export const saveRequirements = mutation({
  args: {
    opportunityId: v.id("opportunities"),
    requirements: v.array(vEdited),
    threshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    const tender = opportunity.tender;
    if (tender?.status === "reading") throw new ConvexError("Wait for the tender to finish being read.");
    if (args.threshold !== undefined && !(args.threshold >= 0 && args.threshold <= 1000))
      throw new ConvexError("The minimum to proceed must be between 0 and 1000 points.");
    const requirements = cleanRequirements(tender?.requirements ?? [], args.requirements);
    await ctx.db.patch("opportunities", opportunity._id, {
      tender: {
        gaps: [],
        ...tender,
        status: "draft",
        requirements,
        threshold: args.threshold,
        confirmedAt: undefined,
        confirmedBy: undefined,
        readBy: tender?.readBy ?? enterprise.user.name,
      },
    });
    const count = (list: { kind: string }[]) =>
      `${list.length} (${list.filter((r) => r.kind === "mandatory").length} mandatory, ${list.filter((r) => r.kind === "scored").length} scored)`;
    await auditTender(ctx, enterprise, opportunity, "tender.edited", {
      summary: `${enterprise.user.name} edited the tender requirements for ${opportunity.reference}${
        tender?.status === "confirmed" ? ", which need confirming again" : ""
      }.`,
      changes: [
        { field: "Requirements", before: count(tender?.requirements ?? []), after: count(requirements) },
        { field: "Minimum technical points", before: auditValue(tender?.threshold), after: auditValue(args.threshold) },
      ],
    });
    return null;
  },
});

/** Starts a fresh review of every application still in play. */
async function reviewAgain(ctx: MutationCtx, opportunity: Doc<"opportunities">) {
  const applications = await ctx.db
    .query("applications")
    .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
    .take(APPLICATION_LIMIT);
  const due = applications.filter((a) => a.status !== "awarded");
  for (const application of due) await startReview(ctx, application._id as Id<"applications">);
  return due.length;
}

/** The buyer confirms the register. Every application is checked against it from now on, including these. */
export const confirmRequirements = mutation({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    const tender = opportunity.tender;
    if (!tender || tender.status === "reading")
      throw new ConvexError("There’s no list of requirements to confirm yet.");
    if (!tender.requirements.some((r) => r.kind !== "condition"))
      throw new ConvexError("Add at least one requirement, criterion or returnable document first.");
    await ctx.db.patch("opportunities", opportunity._id, {
      tender: {
        ...tender,
        status: "confirmed",
        error: undefined,
        confirmedAt: Date.now(),
        confirmedBy: enterprise.user.name,
      },
    });
    const reviewed = await reviewAgain(ctx, opportunity);
    await addTrail(ctx, {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      kind: "tender",
      actor: enterprise.user.name,
      summary: `Confirmed ${tender.requirements.length} tender requirements${
        tender.threshold !== undefined ? ` with a minimum of ${tender.threshold} technical points` : ""
      }.${reviewed ? ` ${reviewed} application${reviewed === 1 ? " is" : "s are"} being checked against them.` : ""}`,
    });
    await auditTender(ctx, enterprise, opportunity, "tender.confirmed", {
      summary: `${enterprise.user.name} confirmed ${tender.requirements.length} tender requirements for ${opportunity.reference}. ${reviewed} application${reviewed === 1 ? " was" : "s were"} sent to be checked against them.`,
      changes: [
        { field: "Requirements", before: "Not confirmed", after: `${tender.requirements.length} confirmed` },
        { field: "Minimum technical points", before: "none", after: auditValue(tender.threshold) },
      ],
    });
    return reviewed;
  },
});

/** Stops checking applications against the register. Applications keep their last review until reviewed again. */
export const removeRequirements = mutation({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    if (!opportunity.tender) return null;
    if (opportunity.tender.status === "reading") throw new ConvexError("Wait for the tender to finish being read.");
    await ctx.db.patch("opportunities", opportunity._id, { tender: undefined });
    await addTrail(ctx, {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      kind: "tender",
      actor: enterprise.user.name,
      summary: "Removed the tender requirements. Applications are checked against the listing’s criteria only.",
    });
    await auditTender(ctx, enterprise, opportunity, "tender.removed", {
      summary: `${enterprise.user.name} stopped checking applications to ${opportunity.reference} against its tender requirements.`,
      changes: [{ field: "Requirements", before: `${opportunity.tender.requirements.length}`, after: "none" }],
    });
    return null;
  },
});
