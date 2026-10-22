import { vResultValidator, vWorkflowId, WorkflowManager } from "@convex-dev/workflow";
import { ConvexError, v } from "convex/values";

import { DOCUMENTS } from "../src/lib/sme/documents";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { organizationsFor } from "./account";
import { authComponent } from "./auth";
import { APPLICATION_LIMIT } from "./lib/opportunities";
import { canManage } from "./lib/organizationSettings";
import { evaluateApplication } from "./lib/evaluation";
import { bbbeePoints, classifyCriteria, pricePoints, rand } from "./lib/procurement";
import { getStaff } from "./lib/staff";
import { criterionAssessment, type DocKey, type TrailKind } from "./schema";

/*
 * Jev reviews applications and decides who is approved, as two durable workflows:
 *
 *   reviewApplication  runs when an SME applies: reads every document behind the application (the profile's
 *                      compliance documents the opportunity asks for, and the files sent with it), then
 *                      scores it against the buyer's evaluation criteria.
 *   decideOpportunity  runs when the buyer asks: waits for reviews, calculates price and B-BBEE points with
 *                      the preferential procurement formulas, has Jev decide who's approved, then applies
 *                      guardrails (only eligible applicants, never more than the buyer asked for).
 *
 * Every step writes to reviewTrail, so anyone can see what Jev read, how it scored and why it decided.
 * The Jev calls themselves live in reviewActions.ts (Node, for reading PDFs).
 */

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    // Jev calls go to OpenRouter; retry outages and unparseable answers a few times with backoff
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 2000, base: 2 },
    maxParallelism: 5,
  },
});

const JEV = "Jev";
/** Most files sent with one application. */
export const MAX_ATTACHMENTS = 5;
/** How long a decision waits for reviews that are still running before deciding without them. */
const REVIEW_WAIT_ATTEMPTS = 40;
const REVIEW_WAIT_MS = 15_000;

/* ------------------------------------------------------------------------------------------------------ */
/* Paper trail                                                                                            */
/* ------------------------------------------------------------------------------------------------------ */

type TrailEntry = {
  opportunityId: Id<"opportunities">;
  organizationId: string;
  applicationId?: Id<"applications">;
  runId?: Id<"decisionRuns">;
  kind: TrailKind;
  actor: string;
  summary: string;
  details?: string[];
  model?: string;
  generationId?: string;
  costUsd?: number;
};

/** An action error without Convex's "Uncaught Error" prefix or the stack trace. */
function readableError(error: string) {
  return error.replace(/^(Error: )?(Uncaught Error: )?/, "").split("\n")[0].trim() || "Unknown error";
}

export async function addTrail(ctx: MutationCtx, entry: TrailEntry) {
  await ctx.db.insert("reviewTrail", entry);
}

const vJevCall = {
  model: v.string(),
  generationId: v.optional(v.string()),
  costUsd: v.optional(v.number()),
};

/* ------------------------------------------------------------------------------------------------------ */
/* Reviewing one application                                                                              */
/* ------------------------------------------------------------------------------------------------------ */

/** Starts Jev's review of an application. Call from the mutation that creates or resubmits it. */
export async function startReview(ctx: MutationCtx, applicationId: Id<"applications">) {
  const workflowId = await workflow.start(
    ctx,
    internal.review.reviewApplication,
    { applicationId },
    { onComplete: internal.review.reviewFinished, context: { applicationId } },
  );
  await ctx.db.patch("applications", applicationId, {
    review: { status: "reviewing", workflowId, startedAt: Date.now() },
  });
  return workflowId;
}

export const reviewApplication = workflow
  .define({ args: { applicationId: v.id("applications") } })
  .handler(async (step, args): Promise<void> => {
    const documents = await step.runQuery(internal.review.documentsToRead, args);
    // Each document is its own step, so a failure on one is retried without re-reading the others
    await Promise.all(
      documents.map((key) => step.runAction(internal.reviewActions.extractDocument, { ...args, key }, { name: `read ${key}` })),
    );
    await step.runAction(internal.reviewActions.assessApplication, args, { name: "score against criteria" });
  });

export const reviewFinished = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ applicationId: v.id("applications") }) },
  handler: async (ctx, args) => {
    const application = await ctx.db.get("applications", args.context.applicationId);
    // A newer review replaced this one, or the application was withdrawn
    if (!application || application.review?.workflowId !== args.workflowId) return;
    if (args.result.kind === "success") return;

    const error = args.result.kind === "failed" ? readableError(args.result.error) : "The review was cancelled.";
    await ctx.db.patch("applications", application._id, {
      review: { ...application.review, status: "failed", finishedAt: Date.now(), error: error.slice(0, 500) },
    });
    await addTrail(ctx, {
      opportunityId: application.opportunityId,
      organizationId: application.organizationId,
      applicationId: application._id,
      kind: "error",
      actor: JEV,
      summary: "Jev couldn’t finish reviewing this application. It keeps YES Hub’s eligibility check until it’s retried.",
      details: [error.slice(0, 1000)],
    });
  },
});

/** The documents behind an application: the profile documents the opportunity asks for, then attachments. */
function documentsOf(sme: Doc<"smes">, opportunity: Doc<"opportunities">, application: Doc<"applications">) {
  // With no requirement listed, Jev still reads the core compliance documents
  const wanted = (opportunity.requiredDocuments.length
    ? opportunity.requiredDocuments
    : ["bbbeeCertificate", "taxCertificate", "cipcCertificate"]) as DocKey[];
  const profile = wanted.flatMap((key) => {
    const doc = sme.documents[key];
    if (!doc?.storageId) return [];
    const label = DOCUMENTS.find((d) => d.key === key)?.label ?? key;
    return [{ key, source: "profile" as const, label, name: doc.name, storageId: doc.storageId, type: doc.type }];
  });
  const attached = (application.attachments ?? []).map((file, i) => ({
    key: `attachment-${i + 1}`,
    source: "application" as const,
    label: file.label,
    name: file.name,
    storageId: file.storageId,
    type: file.type,
  }));
  return [...profile, ...attached];
}

export const documentsToRead = internalQuery({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args): Promise<string[]> => {
    const application = await ctx.db.get("applications", args.applicationId);
    if (!application) return [];
    const [sme, opportunity] = await Promise.all([
      ctx.db.get("smes", application.smeId),
      ctx.db.get("opportunities", application.opportunityId),
    ]);
    if (!sme || !opportunity) return [];
    return documentsOf(sme, opportunity, application).map((d) => d.key);
  },
});

/** One document to read, with the profile facts Jev checks it against. */
export const extractionInput = internalQuery({
  args: { applicationId: v.id("applications"), key: v.string() },
  handler: async (ctx, args) => {
    const application = await ctx.db.get("applications", args.applicationId);
    if (!application) return null;
    const [sme, opportunity] = await Promise.all([
      ctx.db.get("smes", application.smeId),
      ctx.db.get("opportunities", application.opportunityId),
    ]);
    if (!sme || !opportunity) return null;
    const doc = documentsOf(sme, opportunity, application).find((d) => d.key === args.key);
    if (!doc) return null;
    return {
      document: doc,
      sampleData: !!sme.isDemo,
      profile: {
        companyName: sme.companyName,
        registrationNumber: sme.registrationNumber,
        csdNumber: sme.csdNumber,
        bbbeeLevel: sme.bbbeeLevel,
        bbbeeExpiry: sme.bbbeeExpiry,
        taxExpiry: sme.taxExpiry,
        address: [sme.address, sme.city, sme.hqProvince].filter(Boolean).join(", "),
      },
    };
  },
});

export const saveExtraction = internalMutation({
  args: {
    applicationId: v.id("applications"),
    key: v.string(),
    status: v.union(v.literal("read"), v.literal("unreadable")),
    documentType: v.string(),
    matchesLabel: v.boolean(),
    fields: v.array(v.object({ name: v.string(), value: v.string() })),
    issues: v.array(v.string()),
    summary: v.string(),
    excerpt: v.string(),
    call: v.optional(v.object(vJevCall)),
  },
  handler: async (ctx, { call, ...args }) => {
    const application = await ctx.db.get("applications", args.applicationId);
    if (!application) return null;
    const [sme, opportunity] = await Promise.all([
      ctx.db.get("smes", application.smeId),
      ctx.db.get("opportunities", application.opportunityId),
    ]);
    const doc = sme && opportunity ? documentsOf(sme, opportunity, application).find((d) => d.key === args.key) : null;
    if (!doc) return null;

    const row = {
      ...args,
      opportunityId: application.opportunityId,
      source: doc.source,
      label: doc.label,
      name: doc.name,
      storageId: doc.storageId,
      model: call?.model,
    };
    // A retried step or a re-review replaces the earlier reading
    const existing = await ctx.db
      .query("documentExtractions")
      .withIndex("by_application_and_key", (q) => q.eq("applicationId", args.applicationId).eq("key", args.key))
      .unique();
    if (existing) await ctx.db.replace("documentExtractions", existing._id, row);
    else await ctx.db.insert("documentExtractions", row);

    await addTrail(ctx, {
      opportunityId: application.opportunityId,
      organizationId: application.organizationId,
      applicationId: application._id,
      kind: "extraction",
      actor: JEV,
      summary:
        args.status === "unreadable"
          ? `Couldn’t read ${doc.label} (${doc.name}): ${args.summary}`
          : `Read ${doc.label} (${doc.name})${args.issues.length ? `, with ${args.issues.length} issue${args.issues.length === 1 ? "" : "s"}` : ""}. ${args.summary}`,
      details: [
        ...args.fields.map((f) => `${f.name}: ${f.value}`),
        ...args.issues.map((issue) => `Issue: ${issue}`),
      ],
      ...call,
    });
    return null;
  },
});

/** Everything Jev scores an application from. */
export const assessmentInput = internalQuery({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const application = await ctx.db.get("applications", args.applicationId);
    if (!application) return null;
    const [sme, opportunity] = await Promise.all([
      ctx.db.get("smes", application.smeId),
      ctx.db.get("opportunities", application.opportunityId),
    ]);
    if (!sme || !opportunity) return null;

    const extractions = await ctx.db
      .query("documentExtractions")
      .withIndex("by_application_and_key", (q) => q.eq("applicationId", application._id))
      .take(50);

    return {
      opportunity: {
        kind: opportunity.kind,
        title: opportunity.title,
        description: opportunity.description,
        scope: opportunity.listing?.scope ?? "",
        industry: opportunity.industry,
        services: opportunity.services,
        provinces: opportunity.provinces,
        minBbbeeLevel: opportunity.minBbbeeLevel ?? null,
        value: opportunity.value ?? null,
        requiredDocuments: opportunity.requiredDocuments.map((k) => DOCUMENTS.find((d) => d.key === k)?.label ?? k),
        criteria: classifyCriteria(opportunity.listing?.evaluationCriteria ?? []),
      },
      sme: {
        companyName: sme.companyName,
        industry: sme.industry,
        yearsTrading: sme.yearsTrading,
        employees: sme.employees,
        city: sme.city,
        province: sme.hqProvince,
        nationwide: sme.nationwide,
        provinces: sme.provinces,
        services: sme.services,
        capabilities: sme.capabilities,
        accreditations: sme.accreditations,
        bbbeeLevel: sme.bbbeeLevel,
        csdNumber: sme.csdNumber,
        verifiedByYesHub: !!sme.verifiedAt,
      },
      application: {
        quote: application.quote ?? null,
        proposal: application.proposal ?? "",
        attachments: (application.attachments ?? []).map((a) => a.label),
      },
      // Recalculated rather than read back, because a re-review replaces the stored rules evaluation. Reading
      // the clock is fine here: this query only runs once, from the review action, never reactively.
      rules: evaluateApplication(opportunity, sme),
      documents: extractions.map((e) => ({
        label: e.label,
        source: e.source,
        status: e.status,
        documentType: e.documentType,
        matchesLabel: e.matchesLabel,
        fields: e.fields,
        issues: e.issues,
        summary: e.summary,
      })),
    };
  },
});

export const saveAssessment = internalMutation({
  args: {
    applicationId: v.id("applications"),
    qualifies: v.boolean(),
    score: v.number(),
    summary: v.string(),
    checks: v.array(
      v.object({ id: v.string(), label: v.string(), passed: v.boolean(), required: v.boolean(), detail: v.string() }),
    ),
    criteria: v.array(criterionAssessment),
    concerns: v.array(v.string()),
    call: v.object(vJevCall),
  },
  handler: async (ctx, { applicationId, call, ...result }) => {
    const application = await ctx.db.get("applications", applicationId);
    if (!application) return null;

    await ctx.db.patch("applications", application._id, {
      evaluation: { engine: "jev", ...result, evaluatedAt: Date.now(), model: call.model },
      review: { ...(application.review ?? { startedAt: Date.now() }), status: "reviewed", finishedAt: Date.now(), error: undefined },
    });
    await addTrail(ctx, {
      opportunityId: application.opportunityId,
      organizationId: application.organizationId,
      applicationId: application._id,
      kind: "assessment",
      actor: JEV,
      summary: `${result.qualifies ? "Qualifies" : "Doesn’t qualify"}, score ${result.score}. ${result.summary}`,
      details: [
        ...result.criteria.map((c) => {
          const outcome =
            c.met !== undefined ? (c.met ? "met" : "not met") : c.score !== undefined ? `${c.score}/100` : "calculated at decision";
          return `${c.criterion}: ${outcome}. ${c.reasoning}${c.evidence.length ? ` Evidence: ${c.evidence.join("; ")}` : ""}`;
        }),
        ...result.checks.filter((c) => c.required && !c.passed).map((c) => `Requirement not met: ${c.label}. ${c.detail}`),
        ...result.concerns.map((c) => `Concern: ${c}`),
      ],
      ...call,
    });
    return null;
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Deciding an opportunity                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

export const decideOpportunity = workflow
  .define({ args: { runId: v.id("decisionRuns") } })
  .handler(async (step, args): Promise<void> => {
    // Review anything that hasn't been (applications from before Jev, or failed reviews)
    const unreviewed = await step.runQuery(internal.review.unreviewedApplications, args);
    await Promise.all(
      unreviewed.map((applicationId) =>
        step.runMutation(internal.review.restartReview, { applicationId }, { name: "start missing review" }),
      ),
    );
    // Wait for reviews in progress, then decide with whatever finished
    for (let attempt = 0; attempt < REVIEW_WAIT_ATTEMPTS; attempt++) {
      const pending = await step.runQuery(internal.review.reviewsInProgress, args);
      if (pending === 0) break;
      await step.sleep(REVIEW_WAIT_MS, { name: "wait for reviews" });
    }

    // Declining someone because their review failed (an outage, no credits) would be unfair: stop instead
    const failed = await step.runQuery(internal.review.failedReviews, args);
    if (failed.count > 0) {
      throw new Error(
        `Jev couldn’t review ${failed.count} application${failed.count === 1 ? "" : "s"}, so nobody was decided. ${failed.error ?? ""}`.trim(),
      );
    }

    const candidates = await step.runMutation(internal.review.calculatePoints, args);
    const decision = await step.runAction(internal.reviewActions.decide, { runId: args.runId, candidates });
    await step.runMutation(internal.review.applyDecision, { runId: args.runId, candidates, ...decision });
  });

export const decisionFinished = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ runId: v.id("decisionRuns") }) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("decisionRuns", args.context.runId);
    if (!run || run.status !== "running" || args.result.kind === "success") return;
    const error = args.result.kind === "failed" ? readableError(args.result.error) : "The decision was cancelled.";
    await ctx.db.patch("decisionRuns", run._id, { status: "failed", finishedAt: Date.now(), error: error.slice(0, 500) });
    await addTrail(ctx, {
      opportunityId: run.opportunityId,
      organizationId: run.organizationId,
      runId: run._id,
      kind: "error",
      actor: JEV,
      summary: "Jev couldn’t finish the decision. Nobody’s status was changed.",
      details: [error.slice(0, 1000)],
    });
  },
});

async function applicationsOfRun(ctx: QueryCtx, runId: Id<"decisionRuns">) {
  const run = await ctx.db.get("decisionRuns", runId);
  if (!run) return { run: null, applications: [] };
  const applications = await ctx.db
    .query("applications")
    .withIndex("by_opportunity", (q) => q.eq("opportunityId", run.opportunityId))
    .take(APPLICATION_LIMIT);
  return { run, applications };
}

export const unreviewedApplications = internalQuery({
  args: { runId: v.id("decisionRuns") },
  handler: async (ctx, args): Promise<Id<"applications">[]> => {
    const { applications } = await applicationsOfRun(ctx, args.runId);
    return applications.filter((a) => !a.review || a.review.status === "failed").map((a) => a._id);
  },
});

export const reviewsInProgress = internalQuery({
  args: { runId: v.id("decisionRuns") },
  handler: async (ctx, args): Promise<number> => {
    const { applications } = await applicationsOfRun(ctx, args.runId);
    return applications.filter((a) => a.review?.status === "reviewing").length;
  },
});

export const failedReviews = internalQuery({
  args: { runId: v.id("decisionRuns") },
  handler: async (ctx, args): Promise<{ count: number; error: string | null }> => {
    const { applications } = await applicationsOfRun(ctx, args.runId);
    const failed = applications.filter((a) => a.review?.status !== "reviewed");
    // The first line of the error is the readable part; the rest is a stack trace
    const raw = failed.find((a) => a.review?.error)?.review?.error;
    const error = raw ? readableError(raw) : null;
    return { count: failed.length, error };
  },
});

export const restartReview = internalMutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    await startReview(ctx, args.applicationId);
    return null;
  },
});

const vCandidate = v.object({
  applicationId: v.id("applications"),
  companyName: v.string(),
  eligible: v.boolean(),
  /** Why not, when not eligible. */
  ineligibleReasons: v.array(v.string()),
  rank: v.optional(v.number()),
  quote: v.optional(v.number()),
  pricePoints: v.optional(v.number()),
  bbbeePoints: v.optional(v.number()),
  totalPoints: v.optional(v.number()),
  score: v.number(),
  summary: v.string(),
  criteria: v.array(v.string()),
  concerns: v.array(v.string()),
  reviewed: v.boolean(),
});
export type Candidate = typeof vCandidate.type;

/**
 * Who is eligible and their points, calculated the same way every time. Price points compare each quote
 * with the lowest eligible quote, so they can only be worked out once every review is in.
 */
export const calculatePoints = internalMutation({
  args: { runId: v.id("decisionRuns") },
  handler: async (ctx, args): Promise<Candidate[]> => {
    const { run, applications } = await applicationsOfRun(ctx, args.runId);
    if (!run) return [];
    const opportunity = await ctx.db.get("opportunities", run.opportunityId);
    if (!opportunity) return [];

    const criteria = classifyCriteria(opportunity.listing?.evaluationCriteria ?? []);
    const price = criteria.find((c) => c.kind === "price");
    const bbbee = criteria.find((c) => c.kind === "bbbee");

    const rows = [];
    for (const application of applications) {
      const sme = await ctx.db.get("smes", application.smeId);
      if (!sme) continue;
      const evaluation = application.evaluation;
      const reasons = evaluation.qualifies ? [] : [evaluation.summary];
      if (application.review?.status !== "reviewed") reasons.push("Jev hasn’t finished reviewing this application");
      if (price && !(application.quote && application.quote > 0)) reasons.push("No price quoted");
      rows.push({ application, sme, reasons });
    }

    const eligibleQuotes = rows
      .filter((r) => r.reasons.length === 0 && r.application.quote)
      .map((r) => r.application.quote!);
    const lowest = eligibleQuotes.length ? Math.min(...eligibleQuotes) : 0;

    // The working behind each applicant's points, for the trail
    const working = new Map<Id<"applications">, string[]>();
    const candidates: Candidate[] = rows.map(({ application, sme, reasons }) => {
      const evaluation = application.evaluation;
      const eligible = reasons.length === 0;
      const lines: string[] = [];
      let pricePts: number | undefined;
      let bbbeePts: number | undefined;
      let total: number | undefined;

      if (eligible && price && application.quote) {
        pricePts = pricePoints(application.quote, lowest, price.points!);
        lines.push(
          `Price: ${rand(application.quote)} quoted, lowest eligible quote ${rand(lowest)}. ` +
            `${price.points} × (1 − (${rand(application.quote)} − ${rand(lowest)}) ÷ ${rand(lowest)}) = ${pricePts} points`,
        );
      }
      if (eligible && bbbee) {
        // Jev checks the certificate supports the claimed level; if it doesn't, the level can't be claimed
        const certificate = evaluation.criteria?.find((c) => c.kind === "bbbee");
        const supported = certificate?.met !== false;
        bbbeePts = supported ? bbbeePoints(sme.bbbeeLevel, bbbee.points!, price?.points) : 0;
        lines.push(
          supported
            ? `B-BBEE: ${sme.bbbeeLevel || "non-compliant"} scores ${bbbeePts} of ${bbbee.points} points`
            : `B-BBEE: 0 of ${bbbee.points} points. Jev found the certificate doesn’t support ${sme.bbbeeLevel}`,
        );
      }
      if (eligible) {
        if (price || bbbee) {
          total = Math.round(((pricePts ?? 0) + (bbbeePts ?? 0)) * 100) / 100;
          lines.push(`Total: ${total} points`);
        } else {
          // No price or B-BBEE criteria (e.g. grants): the average of Jev's criterion scores, or its overall score
          const scored = (evaluation.criteria ?? []).flatMap((c) => (c.score !== undefined ? [c.score] : []));
          total = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : evaluation.score;
          lines.push(
            scored.length
              ? `Average of ${scored.length} criterion score${scored.length === 1 ? "" : "s"}: ${total}`
              : `Jev’s overall score: ${total}`,
          );
        }
      }
      working.set(application._id, lines);

      return {
        applicationId: application._id,
        companyName: sme.companyName,
        eligible,
        ineligibleReasons: reasons,
        quote: application.quote,
        pricePoints: pricePts,
        bbbeePoints: bbbeePts,
        totalPoints: total,
        score: evaluation.score,
        summary: evaluation.summary,
        criteria: (evaluation.criteria ?? []).map((c) => `${c.criterion}: ${c.reasoning}`),
        concerns: evaluation.concerns ?? [],
        reviewed: application.review?.status === "reviewed",
      };
    });

    // Rank the eligible: most points, then Jev's score, then who applied first
    const order = new Map(applications.map((a) => [a._id, a.submittedAt]));
    const ranked = candidates
      .filter((c) => c.eligible)
      .sort(
        (a, b) =>
          (b.totalPoints ?? 0) - (a.totalPoints ?? 0) || b.score - a.score || order.get(a.applicationId)! - order.get(b.applicationId)!,
      );
    ranked.forEach((c, i) => (c.rank = i + 1));

    for (const c of candidates) {
      await addTrail(ctx, {
        opportunityId: run.opportunityId,
        organizationId: run.organizationId,
        applicationId: c.applicationId,
        runId: run._id,
        kind: "points",
        actor: "YES Hub",
        summary: c.eligible
          ? `${c.companyName} is eligible: ${c.totalPoints} points, ranked ${c.rank} of ${ranked.length}.`
          : `${c.companyName} isn’t eligible: ${c.ineligibleReasons.join("; ")}`,
        details: working.get(c.applicationId),
      });
    }
    return candidates;
  },
});

export const decisionInput = internalQuery({
  args: { runId: v.id("decisionRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("decisionRuns", args.runId);
    if (!run) return null;
    const opportunity = await ctx.db.get("opportunities", run.opportunityId);
    if (!opportunity) return null;
    return {
      slots: run.slots,
      opportunity: {
        kind: opportunity.kind,
        title: opportunity.title,
        scope: opportunity.listing?.scope ?? opportunity.description,
        value: opportunity.value ?? null,
        criteria: opportunity.listing?.evaluationCriteria ?? [],
      },
    };
  },
});

export const applyDecision = internalMutation({
  args: {
    runId: v.id("decisionRuns"),
    candidates: v.array(vCandidate),
    summary: v.string(),
    decisions: v.array(
      v.object({ applicationId: v.id("applications"), approved: v.boolean(), rationale: v.string() }),
    ),
    call: v.object(vJevCall),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("decisionRuns", args.runId);
    if (!run || run.status !== "running") return null;
    const opportunity = await ctx.db.get("opportunities", run.opportunityId);
    if (!opportunity) return null;

    const trail = (entry: Omit<TrailEntry, "opportunityId" | "organizationId" | "runId">) =>
      addTrail(ctx, { opportunityId: run.opportunityId, organizationId: run.organizationId, runId: run._id, ...entry });

    // Guardrails: Jev only approves eligible applicants, never more than the buyer asked for, and anyone it
    // didn't decide on isn't approved
    const byId = new Map(args.decisions.map((d) => [d.applicationId, d]));
    const approved: Candidate[] = [];
    const outcomes = new Map<Id<"applications">, { approved: boolean; rationale: string }>();
    const ranked = [...args.candidates].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

    for (const c of ranked) {
      const jev = byId.get(c.applicationId);
      let ok = jev?.approved ?? false;
      let rationale = jev?.rationale || "Jev didn’t give a decision for this applicant, so it isn’t approved.";
      if (!jev) {
        await trail({ applicationId: c.applicationId, kind: "guardrail", actor: "YES Hub", summary: `No decision from Jev for ${c.companyName}; not approved.` });
      }
      if (ok && !c.eligible) {
        ok = false;
        rationale = `Not eligible: ${c.ineligibleReasons.join("; ")}`;
        await trail({
          applicationId: c.applicationId,
          kind: "guardrail",
          actor: "YES Hub",
          summary: `Jev approved ${c.companyName}, but they aren’t eligible, so they weren’t approved.`,
          details: c.ineligibleReasons,
        });
      }
      if (ok && approved.length >= run.slots) {
        ok = false;
        rationale = `${rationale} Not approved: the ${run.slots} place${run.slots === 1 ? " was" : "s were"} already filled by higher-ranked applicants.`;
        await trail({
          applicationId: c.applicationId,
          kind: "guardrail",
          actor: "YES Hub",
          summary: `Jev approved more applicants than the ${run.slots} asked for; ${c.companyName} (ranked ${c.rank}) wasn’t approved.`,
        });
      }
      if (ok) approved.push(c);
      outcomes.set(c.applicationId, { approved: ok, rationale });
    }

    const now = Date.now();
    for (const c of args.candidates) {
      const outcome = outcomes.get(c.applicationId)!;
      const application = await ctx.db.get("applications", c.applicationId);
      if (!application) continue;
      await ctx.db.patch("applications", application._id, {
        status: outcome.approved ? "awarded" : "declined",
        statusChangedAt: now,
        statusChangedBy: JEV,
        decision: {
          runId: run._id,
          outcome: outcome.approved ? "approved" : "not_approved",
          rank: c.rank,
          eligible: c.eligible,
          pricePoints: c.pricePoints,
          bbbeePoints: c.bbbeePoints,
          totalPoints: c.totalPoints,
          rationale: outcome.rationale,
          decidedAt: now,
        },
      });
      await trail({
        applicationId: c.applicationId,
        kind: "decision",
        actor: JEV,
        summary: `${outcome.approved ? "Approved" : "Not approved"}: ${c.companyName}${c.rank ? ` (ranked ${c.rank})` : ""}.`,
        details: [outcome.rationale],
        model: args.call.model,
      });
    }

    await ctx.db.patch("decisionRuns", run._id, {
      status: "decided",
      finishedAt: now,
      summary: args.summary,
      approved: approved.length,
      model: args.call.model,
    });
    if (approved.length > 0) await ctx.db.patch("opportunities", opportunity._id, { status: "awarded" });
    await trail({
      kind: "decision",
      actor: JEV,
      summary: `Decided: ${approved.length} of ${args.candidates.length} applicant${args.candidates.length === 1 ? "" : "s"} approved (${run.slots} place${run.slots === 1 ? "" : "s"}). ${args.summary}`,
      details: approved.map((c) => `Approved: ${c.companyName}, ranked ${c.rank}, ${c.totalPoints} points`),
      ...args.call,
    });
    return null;
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Buyers: asking for a decision, overriding it, reading the trail                                        */
/* ------------------------------------------------------------------------------------------------------ */

/** The signed-in user's enterprise organisation, or null. */
async function getEnterprise(ctx: QueryCtx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  const organization = (await organizationsFor(ctx, user._id)).find((org) => org.kind === "enterprise");
  return organization ? { user, organization } : null;
}

/** Who may read an opportunity's trail: its own organisation, or YES Hub staff. */
async function canReadOpportunity(ctx: QueryCtx, organizationId: string) {
  const enterprise = await getEnterprise(ctx);
  if (enterprise?.organization.id === organizationId) return { enterprise, staff: null };
  const staff = await getStaff(ctx, { organization: ["read"] });
  return staff ? { enterprise: null, staff } : null;
}

export const requestDecision = mutation({
  args: { opportunityId: v.id("opportunities"), slots: v.number() },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    const opportunity = await ctx.db.get("opportunities", args.opportunityId);
    if (!enterprise || !opportunity || opportunity.organizationId !== enterprise.organization.id) {
      throw new ConvexError("That opportunity isn’t available.");
    }
    if (!canManage(enterprise.organization.role)) throw new ConvexError("Only owners and admins can ask Jev to decide.");
    if (enterprise.organization.verificationStatus !== "verified") {
      throw new ConvexError("YES Hub needs to verify your organisation first.");
    }
    const slots = Math.floor(args.slots);
    if (slots < 1 || slots > 50) throw new ConvexError("Choose between 1 and 50 applicants to approve.");

    const runs = await ctx.db
      .query("decisionRuns")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
      .order("desc")
      .take(1);
    if (runs[0]?.status === "running") throw new ConvexError("Jev is already deciding this opportunity.");
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
      .take(1);
    if (applications.length === 0) throw new ConvexError("Nobody has applied yet.");

    const runId = await ctx.db.insert("decisionRuns", {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      requestedBy: enterprise.user.name,
      requestedById: enterprise.user._id,
      slots,
      status: "running",
    });
    const workflowId = await workflow.start(
      ctx,
      internal.review.decideOpportunity,
      { runId },
      { onComplete: internal.review.decisionFinished, context: { runId } },
    );
    await ctx.db.patch("decisionRuns", runId, { workflowId });
    await addTrail(ctx, {
      opportunityId: opportunity._id,
      organizationId: opportunity.organizationId,
      runId,
      kind: "decision_started",
      actor: enterprise.user.name,
      summary: `${enterprise.user.name} asked Jev to decide, approving up to ${slots} applicant${slots === 1 ? "" : "s"}.`,
    });
    return runId;
  },
});

/** Changes Jev's decision on one applicant. The reason is required and goes on the trail. */
export const overrideDecision = mutation({
  args: {
    applicationId: v.id("applications"),
    outcome: v.union(v.literal("approved"), v.literal("not_approved")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    const application = await ctx.db.get("applications", args.applicationId);
    if (!enterprise || !application || application.organizationId !== enterprise.organization.id) {
      throw new ConvexError("That application isn’t available.");
    }
    if (!canManage(enterprise.organization.role)) throw new ConvexError("Only owners and admins can change a decision.");
    if (!application.decision) throw new ConvexError("Jev hasn’t decided on this application yet.");
    const reason = args.reason.trim();
    if (reason.length < 10) throw new ConvexError("Give a reason of at least a sentence. It’s kept on the record.");
    if (args.outcome === application.decision.outcome) return null;

    const sme = await ctx.db.get("smes", application.smeId);
    await ctx.db.patch("applications", application._id, {
      status: args.outcome === "approved" ? "awarded" : "declined",
      statusChangedAt: Date.now(),
      statusChangedBy: enterprise.user.name,
      decision: { ...application.decision, outcome: args.outcome, overriddenBy: enterprise.user.name, overrideReason: reason },
    });
    await addTrail(ctx, {
      opportunityId: application.opportunityId,
      organizationId: application.organizationId,
      applicationId: application._id,
      runId: application.decision.runId,
      kind: "override",
      actor: enterprise.user.name,
      summary: `${enterprise.user.name} changed Jev’s decision on ${sme?.companyName ?? "this applicant"} to ${args.outcome === "approved" ? "approved" : "not approved"}.`,
      details: [reason],
    });
    return null;
  },
});

/** Re-runs Jev's review of one application, e.g. after a failed review. */
export const retryReview = mutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const enterprise = await getEnterprise(ctx);
    const application = await ctx.db.get("applications", args.applicationId);
    if (!enterprise || !application || application.organizationId !== enterprise.organization.id) {
      throw new ConvexError("That application isn’t available.");
    }
    if (application.review?.status === "reviewing") throw new ConvexError("Jev is already reviewing it.");
    await startReview(ctx, application._id);
    return null;
  },
});

function trailRow(entry: Doc<"reviewTrail">) {
  return {
    id: entry._id,
    at: entry._creationTime,
    kind: entry.kind,
    actor: entry.actor,
    summary: entry.summary,
    details: entry.details ?? [],
    model: entry.model ?? null,
    generationId: entry.generationId ?? null,
    costUsd: entry.costUsd ?? null,
    applicationId: entry.applicationId ?? null,
  };
}

/** One application's documents as Jev read them, and its full trail, newest first. */
export const applicationReview = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const application = await ctx.db.get("applications", args.applicationId);
    if (!application || !(await canReadOpportunity(ctx, application.organizationId))) return null;

    const [extractions, trail] = await Promise.all([
      ctx.db
        .query("documentExtractions")
        .withIndex("by_application_and_key", (q) => q.eq("applicationId", application._id))
        .take(50),
      ctx.db
        .query("reviewTrail")
        .withIndex("by_application", (q) => q.eq("applicationId", application._id))
        .order("desc")
        .take(200),
    ]);
    const attachments = [];
    for (const file of application.attachments ?? []) {
      attachments.push({ label: file.label, name: file.name, size: file.size, url: await ctx.storage.getUrl(file.storageId) });
    }

    return {
      quote: application.quote ?? null,
      proposal: application.proposal ?? null,
      attachments,
      review: application.review ?? null,
      decision: application.decision ?? null,
      documents: extractions.map((e) => ({
        key: e.key,
        source: e.source,
        label: e.label,
        name: e.name,
        status: e.status,
        documentType: e.documentType,
        matchesLabel: e.matchesLabel,
        fields: e.fields,
        issues: e.issues,
        summary: e.summary,
        excerpt: e.excerpt,
      })),
      trail: trail.map(trailRow),
    };
  },
});

/** An opportunity's decision runs, newest first, with the latest run's trail. */
export const opportunityDecisions = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const opportunity = await ctx.db.get("opportunities", args.opportunityId);
    if (!opportunity) return null;
    const access = await canReadOpportunity(ctx, opportunity.organizationId);
    if (!access) return null;

    const runs = await ctx.db
      .query("decisionRuns")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunity._id))
      .order("desc")
      .take(20);
    const latest = runs[0];
    const trail = latest
      ? await ctx.db
          .query("reviewTrail")
          .withIndex("by_run", (q) => q.eq("runId", latest._id))
          .order("desc")
          .take(500)
      : [];

    return {
      canDecide: !!access.enterprise && canManage(access.enterprise.organization.role),
      runs: runs.map((r) => ({
        id: r._id,
        at: r._creationTime,
        status: r.status,
        slots: r.slots,
        requestedBy: r.requestedBy,
        finishedAt: r.finishedAt ?? null,
        summary: r.summary ?? null,
        approved: r.approved ?? null,
        model: r.model ?? null,
        error: r.error ?? null,
      })),
      trail: trail.map(trailRow),
    };
  },
});

/** Every decision Jev made across YES Hub, newest first, for staff. */
export const recentDecisions = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getStaff(ctx, { organization: ["read"] }))) return null;
    const runs = await ctx.db.query("decisionRuns").order("desc").take(100);
    const organizations = await ctx.runQuery(components.betterAuth.organizations.list, { limit: 500 });
    const names = new Map(organizations.map((o) => [o.id, o.name]));
    const rows = [];
    for (const run of runs) {
      const opportunity = await ctx.db.get("opportunities", run.opportunityId);
      if (!opportunity) continue;
      rows.push({
        id: run._id,
        at: run._creationTime,
        status: run.status,
        slots: run.slots,
        approved: run.approved ?? null,
        summary: run.summary ?? null,
        error: run.error ?? null,
        model: run.model ?? null,
        requestedBy: run.requestedBy,
        organizationName: names.get(run.organizationId) ?? "Deleted organisation",
        opportunity: { id: opportunity._id, title: opportunity.title, reference: opportunity.reference },
      });
    }
    return rows;
  },
});

/** One decision run's full trail, for staff. */
export const decisionTrail = query({
  args: { runId: v.id("decisionRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("decisionRuns", args.runId);
    if (!run || !(await canReadOpportunity(ctx, run.organizationId))) return null;
    const entries = await ctx.db
      .query("reviewTrail")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .order("asc")
      .take(500);
    return entries.map(trailRow);
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Housekeeping                                                                                           */
/* ------------------------------------------------------------------------------------------------------ */

/** Removes what Jev stored for an application. Call wherever an application is deleted. */
export async function deleteReviewData(ctx: MutationCtx, application: Doc<"applications">) {
  for await (const row of ctx.db
    .query("documentExtractions")
    .withIndex("by_application_and_key", (q) => q.eq("applicationId", application._id))) {
    await ctx.db.delete("documentExtractions", row._id);
  }
  for await (const row of ctx.db.query("reviewTrail").withIndex("by_application", (q) => q.eq("applicationId", application._id))) {
    await ctx.db.delete("reviewTrail", row._id);
  }
  for (const file of application.attachments ?? []) await ctx.storage.delete(file.storageId);
}

/** Removes an opportunity's decision runs and their trail. Call wherever an opportunity is deleted. */
export async function deleteDecisionData(ctx: MutationCtx, opportunityId: Id<"opportunities">) {
  for await (const row of ctx.db.query("reviewTrail").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId))) {
    await ctx.db.delete("reviewTrail", row._id);
  }
  for await (const run of ctx.db.query("decisionRuns").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId))) {
    await ctx.db.delete("decisionRuns", run._id);
  }
}

/**
 * Starts Jev reviews for applications that never had one (made before Jev, or seeded):
 *
 *   pnpm exec convex run review:reviewExisting
 */
export const reviewExisting = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let started = 0;
    for await (const application of ctx.db.query("applications")) {
      if (started >= (args.limit ?? 50)) break;
      if (application.review && application.review.status !== "failed") continue;
      await startReview(ctx, application._id);
      started++;
    }
    return started;
  },
});
