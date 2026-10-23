import { ConvexError, type Infer, v } from "convex/values";

import { DOCUMENTS } from "../src/lib/sme/documents";
import { INDUSTRIES, PROVINCES } from "../src/lib/sme/constants";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getEnterprise, organizationDetail, ownOpportunity, teamIdsOf } from "./enterprise";
import { mutation } from "./functions";
import { type AuditChange, auditValue, recordAudit } from "./lib/audit";
import { canManage } from "./lib/organizationSettings";
import { APPLICATION_LIMIT, referencePrefix } from "./lib/opportunities";
import { addTrail } from "./review";
import { opportunityKind, type OpportunityKind } from "./schema";

/*
 * An opportunity's life, as the buyer runs it: created as a draft with a reference MASLink generates, edited,
 * published, amended while open (with a reason), closed early or cancelled (with a reason applicants see).
 * Every step that changes its state goes on the organisation's audit log (lib/audit.ts) with what changed.
 */

/** The reference's middle part says what kind of opportunity it is: UMH-RFQ-2026-017. */
const KIND_CODES: Record<OpportunityKind, string> = { tender: "TND", rfq: "RFQ", grant: "GRT" };
const KIND_WORDS: Record<OpportunityKind, string> = { tender: "tender", rfq: "RFQ", grant: "grant" };
const VALID_DOC_KEYS = new Set<string>(DOCUMENTS.map((d) => d.key));
/** Most opportunities read when numbering a new one. */
const NUMBERING_LIMIT = 2000;

const fields = {
  kind: opportunityKind,
  title: v.string(),
  description: v.string(),
  industry: v.string(),
  services: v.array(v.string()),
  provinces: v.array(v.string()),
  minBbbeeLevel: v.optional(v.number()),
  requiredDocuments: v.array(v.string()),
  value: v.optional(v.number()),
  closesAt: v.string(),
  teamId: v.optional(v.string()),
  scope: v.string(),
  contractPeriod: v.string(),
  briefing: v.string(),
  submission: v.string(),
  evaluationCriteria: v.array(v.string()),
  enquiriesName: v.string(),
  enquiriesEmail: v.string(),
};
/** Everything a buyer fills in for an opportunity. */
export const opportunityFields = v.object(fields);
type Fields = Infer<typeof opportunityFields>;

/** Today as yyyy-mm-dd in South Africa, to compare with closing dates. */
function todayInSouthAfrica() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Tidies and checks what the buyer entered. Throws the first problem in words the buyer can act on. */
function clean(f: Fields) {
  const text = (s: string, max: number) => s.trim().replace(/\s+\n/g, "\n").slice(0, max);
  const list = (items: string[], max: number) =>
    [...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, max).map((s) => s.slice(0, 200));
  const out = {
    kind: f.kind,
    title: text(f.title, 160),
    description: text(f.description, 2000),
    industry: f.industry.trim(),
    services: list(f.services, 20),
    provinces: list(f.provinces, 9),
    minBbbeeLevel: f.minBbbeeLevel || undefined,
    requiredDocuments: list(f.requiredDocuments, 20),
    value: f.value === undefined ? undefined : Math.round(f.value),
    closesAt: f.closesAt.trim(),
    teamId: f.teamId || undefined,
    listing: {
      scope: text(f.scope, 4000),
      contractPeriod: text(f.contractPeriod, 200),
      briefing: text(f.briefing, 500),
      submission: text(f.submission, 1000),
      evaluationCriteria: list(f.evaluationCriteria, 20),
      enquiriesName: text(f.enquiriesName, 120),
      enquiriesEmail: f.enquiriesEmail.trim().toLowerCase(),
    },
  };
  const problem =
    out.title.length < 5
      ? "Give the opportunity a title of at least 5 characters."
      : out.industry && !INDUSTRIES.includes(out.industry)
        ? "Choose an industry from the list."
        : out.provinces.some((p) => !PROVINCES.includes(p))
          ? "Choose provinces from the list."
          : out.requiredDocuments.some((k) => !VALID_DOC_KEYS.has(k))
            ? "Choose required documents from the list."
            : out.minBbbeeLevel !== undefined && !(out.minBbbeeLevel >= 1 && out.minBbbeeLevel <= 8)
              ? "Choose a minimum B-BBEE level from 1 to 8."
              : out.value !== undefined && !(out.value > 0 && out.value < 1e12)
                ? "Enter the estimated value in rand."
                : !/^\d{4}-\d{2}-\d{2}$/.test(out.closesAt) || Number.isNaN(Date.parse(out.closesAt))
                  ? "Choose a closing date."
                  : out.listing.enquiriesEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.listing.enquiriesEmail)
                    ? "Enter a valid email address for enquiries."
                    : null;
  if (problem) throw new ConvexError(problem);
  return out;
}

/** What a published opportunity must have before SMEs see it. */
function readyToPublish(o: Pick<Doc<"opportunities">, "description" | "closesAt" | "listing">) {
  const l = o.listing;
  const missing = [
    !o.description && "a description",
    !l?.scope && "the scope of work",
    !l?.submission && "how to submit",
    !l?.evaluationCriteria.length && "how bids are evaluated",
    !l?.enquiriesName && "a contact for enquiries",
    !l?.enquiriesEmail && "an email for enquiries",
  ].filter(Boolean);
  if (missing.length) throw new ConvexError(`Add ${missing.join(", ")} before publishing.`);
  if (o.closesAt <= todayInSouthAfrica()) throw new ConvexError("The closing date must be after today.");
}

/**
 * The next reference for the organisation: its three-letter prefix, the kind, the year and a number that
 * counts up across the organisation's opportunities that year, e.g. UMH-RFQ-2026-017. A reference is never
 * reused or changed, so documents, applications and the audit log can all point to it. Two creates at once
 * conflict and one retries, so numbers stay unique.
 */
async function nextReference(
  ctx: MutationCtx,
  organizationId: string,
  organizationName: string,
  kind: OpportunityKind,
) {
  const year = new Date(Date.now() + 2 * 60 * 60 * 1000).getUTCFullYear();
  const existing = await ctx.db
    .query("opportunities")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(NUMBERING_LIMIT);
  const pattern = new RegExp(`-${year}-(\\d+)$`);
  const highest = existing.reduce((max, o) => Math.max(max, Number(pattern.exec(o.reference)?.[1] ?? 0)), 0);
  // The counter remembers numbers whose drafts were deleted; existing references cover sample data
  const counter = await ctx.db
    .query("referenceCounters")
    .withIndex("by_organization_and_year", (q) => q.eq("organizationId", organizationId).eq("year", year))
    .unique();
  const prefix = referencePrefix(organizationName);
  for (let n = Math.max(highest, counter?.last ?? 0) + 1; ; n++) {
    const reference = `${prefix}-${KIND_CODES[kind]}-${year}-${String(n).padStart(3, "0")}`;
    const taken = await ctx.db
      .query("opportunities")
      .withIndex("by_organization_and_reference", (q) =>
        q.eq("organizationId", organizationId).eq("reference", reference),
      )
      .first();
    if (taken) continue;
    if (counter) await ctx.db.patch("referenceCounters", counter._id, { last: n });
    else await ctx.db.insert("referenceCounters", { organizationId, year, last: n });
    return reference;
  }
}

const label = (o: Pick<Doc<"opportunities">, "reference" | "title">) => `${o.reference}: ${o.title}`;

/** What the buyer changed, field by field, for the audit log. */
function changesBetween(before: Doc<"opportunities">, after: ReturnType<typeof clean>): AuditChange[] {
  const docLabel = (keys: string[]) => keys.map((k) => DOCUMENTS.find((d) => d.key === k)?.label ?? k);
  const pairs: [string, unknown, unknown][] = [
    ["Title", before.title, after.title],
    ["Description", before.description, after.description],
    ["Industry", before.industry, after.industry],
    ["Services", before.services, after.services],
    ["Provinces", before.provinces, after.provinces],
    ["Minimum B-BBEE level", before.minBbbeeLevel, after.minBbbeeLevel],
    ["Required documents", docLabel(before.requiredDocuments), docLabel(after.requiredDocuments)],
    ["Estimated value (R)", before.value, after.value],
    ["Closing date", before.closesAt, after.closesAt],
    ["Scope of work", before.listing?.scope, after.listing.scope],
    ["Contract period", before.listing?.contractPeriod, after.listing.contractPeriod],
    ["Briefing session", before.listing?.briefing, after.listing.briefing],
    ["How to submit", before.listing?.submission, after.listing.submission],
    ["Evaluation criteria", before.listing?.evaluationCriteria, after.listing.evaluationCriteria],
    ["Enquiries", before.listing?.enquiriesName, after.listing.enquiriesName],
    ["Enquiries email", before.listing?.enquiriesEmail, after.listing.enquiriesEmail],
  ];
  return pairs.map(([field, b, a]) => ({ field, before: auditValue(b), after: auditValue(a) }));
}

/** Only owners and admins, or members of the opportunity's department (any member while it's unassigned). */
async function canEdit(
  ctx: MutationCtx,
  enterprise: NonNullable<Awaited<ReturnType<typeof getEnterprise>>>,
  teamId?: string,
) {
  if (canManage(enterprise.organization.role)) return true;
  const detail = await organizationDetail(ctx, enterprise.organization.id);
  const mine = teamIdsOf(detail, enterprise.user._id);
  return !teamId || mine.includes(teamId);
}

function requireManager(enterprise: NonNullable<Awaited<ReturnType<typeof getEnterprise>>>, what: string) {
  if (!canManage(enterprise.organization.role)) throw new ConvexError(`Only owners and admins can ${what}.`);
}

function requireReason(reason: string) {
  const r = reason.trim();
  if (r.length < 10) throw new ConvexError("Enter a reason of at least 10 characters.");
  if (r.length > 1000) throw new ConvexError("Keep the reason under 1 000 characters.");
  return r;
}

/** Creates an opportunity as a draft, or publishes it straight away. Returns its id and generated reference. */
export const create = mutation({
  args: { ...fields, publish: v.boolean() },
  handler: async (ctx, { publish, ...args }) => {
    const enterprise = await getEnterprise(ctx);
    if (!enterprise) throw new ConvexError("You need an organisation to list opportunities.");
    const f = clean(args);
    if (f.teamId) {
      const detail = await organizationDetail(ctx, enterprise.organization.id);
      if (!detail.teams.some((t) => t.id === f.teamId))
        throw new ConvexError("That department doesn’t exist any more.");
    }
    if (!(await canEdit(ctx, enterprise, f.teamId))) {
      throw new ConvexError("You can only create opportunities for your own departments.");
    }
    if (publish) {
      requireManager(enterprise, "publish opportunities");
      if (enterprise.organization.verificationStatus !== "verified")
        throw new ConvexError("MASLink is still verifying your organisation. Save it as a draft for now.");
    }
    const { listing, ...rest } = f;
    const draft = { ...rest, listing: { ...listing, publishedAt: Date.now() } };
    if (publish) readyToPublish(draft);

    const reference = await nextReference(ctx, enterprise.organization.id, enterprise.organization.name, f.kind);
    const opportunityId = await ctx.db.insert("opportunities", {
      ...draft,
      organizationId: enterprise.organization.id,
      createdBy: enterprise.user.name,
      reference,
      status: publish ? "open" : "draft",
    });
    await recordAudit(ctx, {
      organizationId: enterprise.organization.id,
      actorId: enterprise.user._id,
      actorName: enterprise.user.name,
      action: publish ? "opportunity.published" : "opportunity.created",
      opportunityId,
      targetLabel: `${reference}: ${f.title}`,
      summary: `${enterprise.user.name} ${publish ? "created and published" : "created a draft of"} the ${KIND_WORDS[f.kind]} ${reference}, closing ${f.closesAt}.`,
    });
    return { id: opportunityId, reference };
  },
});

/** Saves changes. A published opportunity can only be amended by owners and admins, with a reason. */
export const update = mutation({
  args: { opportunityId: v.id("opportunities"), ...fields, reason: v.optional(v.string()) },
  handler: async (ctx, { opportunityId, reason, ...args }) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, opportunityId);
    if (opportunity.status === "cancelled" || opportunity.status === "awarded")
      throw new ConvexError(`This opportunity has been ${opportunity.status}, so it can’t change.`);
    const f = clean(args);
    if (f.kind !== opportunity.kind && opportunity.status !== "draft")
      throw new ConvexError("The kind of a published opportunity can’t change. Cancel it and create a new one.");
    if (!(await canEdit(ctx, enterprise, opportunity.teamId)))
      throw new ConvexError("You can only edit opportunities in your own departments.");
    // The department moves through setOpportunityDepartment, which checks both sides
    const { listing, teamId: _teamId, ...rest } = f;
    void _teamId;

    const published = opportunity.status !== "draft";
    let why: string | undefined;
    if (published) {
      requireManager(enterprise, "amend a published opportunity");
      why = requireReason(reason ?? "");
      if (f.closesAt < todayInSouthAfrica()) throw new ConvexError("The closing date can’t be in the past.");
    }
    const changes = changesBetween(opportunity, f);
    if (changes.every((c) => c.before === c.after)) return null;

    const next = { ...rest, listing: { ...listing, publishedAt: opportunity.listing?.publishedAt ?? Date.now() } };
    if (published) readyToPublish(next);
    // A closed opportunity whose closing date moves into the future opens again
    const reopens = opportunity.status === "closed" && f.closesAt > todayInSouthAfrica();
    await ctx.db.patch("opportunities", opportunity._id, { ...next, ...(reopens ? { status: "open" as const } : {}) });

    const extended = f.closesAt !== opportunity.closesAt;
    const action = !published ? "opportunity.edited" : extended ? "opportunity.closing_changed" : "opportunity.amended";
    await recordAudit(ctx, {
      organizationId: opportunity.organizationId,
      actorId: enterprise.user._id,
      actorName: enterprise.user.name,
      action,
      opportunityId: opportunity._id,
      targetLabel: label({ ...opportunity, title: f.title }),
      summary: `${enterprise.user.name} ${published ? "amended" : "edited"} ${opportunity.reference}${
        extended ? `, moving the closing date from ${opportunity.closesAt} to ${f.closesAt}` : ""
      }${reopens ? ", which opens it again" : ""}.`,
      reason: why,
      changes,
    });
    if (published) {
      await addTrail(ctx, {
        opportunityId: opportunity._id,
        organizationId: opportunity.organizationId,
        kind: "action",
        actor: enterprise.user.name,
        summary: `${enterprise.user.name} amended the listing.`,
        details: [
          why!,
          ...changes.filter((c) => c.before !== c.after).map((c) => `${c.field}: ${c.before} → ${c.after}`),
        ],
      });
    }
    return null;
  },
});

/** Publishes a draft so SMEs can find it and apply. */
export const publish = mutation({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    requireManager(enterprise, "publish opportunities");
    if (opportunity.status !== "draft") throw new ConvexError("Only drafts can be published.");
    if (enterprise.organization.verificationStatus !== "verified")
      throw new ConvexError("MASLink is still verifying your organisation. You can publish once it’s verified.");
    readyToPublish(opportunity);
    await ctx.db.patch("opportunities", opportunity._id, {
      status: "open",
      listing: { ...opportunity.listing!, publishedAt: Date.now() },
    });
    await recordAudit(ctx, {
      organizationId: opportunity.organizationId,
      actorId: enterprise.user._id,
      actorName: enterprise.user.name,
      action: "opportunity.published",
      opportunityId: opportunity._id,
      targetLabel: label(opportunity),
      summary: `${enterprise.user.name} published ${opportunity.reference}, closing ${opportunity.closesAt}.`,
      changes: [{ field: "Status", before: "Draft", after: "Open" }],
    });
    return null;
  },
});

/** Stops taking applications before the closing date. */
export const close = mutation({
  args: { opportunityId: v.id("opportunities"), reason: v.string() },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    requireManager(enterprise, "close opportunities");
    if (opportunity.status !== "open") throw new ConvexError("Only open opportunities can be closed.");
    const reason = requireReason(args.reason);
    await ctx.db.patch("opportunities", opportunity._id, { status: "closed" });
    await recordAudit(ctx, {
      organizationId: opportunity.organizationId,
      actorId: enterprise.user._id,
      actorName: enterprise.user.name,
      action: "opportunity.closed",
      opportunityId: opportunity._id,
      targetLabel: label(opportunity),
      summary: `${enterprise.user.name} closed ${opportunity.reference} to new applications.`,
      reason,
      changes: [{ field: "Status", before: "Open", after: "Closed" }],
    });
    await addTrail(ctx, {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      kind: "action",
      actor: enterprise.user.name,
      summary: `${enterprise.user.name} closed the opportunity to new applications.`,
      details: [reason],
    });
    return null;
  },
});

/** Withdraws the opportunity. Applicants see the reason; nothing can be awarded afterwards. */
export const cancel = mutation({
  args: { opportunityId: v.id("opportunities"), reason: v.string() },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    requireManager(enterprise, "cancel opportunities");
    if (opportunity.status === "cancelled") return null;
    if (opportunity.status === "awarded") throw new ConvexError("An awarded opportunity can’t be cancelled.");
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
      .take(APPLICATION_LIMIT);
    if (applications.some((a) => a.status === "awarded"))
      throw new ConvexError("An applicant has already been awarded this opportunity.");
    const reason = requireReason(args.reason);
    await ctx.db.patch("opportunities", opportunity._id, {
      status: "cancelled",
      cancellation: { reason, by: enterprise.user.name, at: Date.now() },
    });
    await recordAudit(ctx, {
      organizationId: opportunity.organizationId,
      actorId: enterprise.user._id,
      actorName: enterprise.user.name,
      action: "opportunity.cancelled",
      opportunityId: opportunity._id,
      targetLabel: label(opportunity),
      summary: `${enterprise.user.name} cancelled ${opportunity.reference}.`,
      reason,
      changes: [{ field: "Status", before: opportunity.status === "draft" ? "Draft" : "Open", after: "Cancelled" }],
    });
    await addTrail(ctx, {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      kind: "action",
      actor: enterprise.user.name,
      summary: `${enterprise.user.name} cancelled the opportunity.`,
      details: [reason],
    });
    return null;
  },
});

/** Deletes a draft nobody has seen. Published opportunities are cancelled instead, so their record stays. */
export const removeDraft = mutation({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const { enterprise, opportunity } = await ownOpportunity(ctx, args.opportunityId);
    if (opportunity.status !== "draft") throw new ConvexError("Only drafts can be deleted. Cancel it instead.");
    if (!(await canEdit(ctx, enterprise, opportunity.teamId)))
      throw new ConvexError("You can only delete drafts in your own departments.");
    const documents = await ctx.db
      .query("opportunityDocuments")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
      .take(50);
    for (const doc of documents) {
      await ctx.storage.delete(doc.storageId).catch(() => {});
      await ctx.db.delete("opportunityDocuments", doc._id);
    }
    await ctx.db.delete("opportunities", opportunity._id);
    await recordAudit(ctx, {
      organizationId: opportunity.organizationId,
      actorId: enterprise.user._id,
      actorName: enterprise.user.name,
      action: "opportunity.draft_deleted",
      targetLabel: label(opportunity),
      summary: `${enterprise.user.name} deleted the draft ${opportunity.reference}. Its reference isn’t reused.`,
    });
    return null;
  },
});
