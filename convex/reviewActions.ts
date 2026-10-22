"use node";

import { v } from "convex/values";
import { extractText, getDocumentProxy } from "unpdf";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { asBoolean, asObject, asScore, asString, asStrings, askJev, clip, JevError } from "./lib/jev";
import type { Candidate } from "./review";
import type { CriterionAssessment, Evaluation } from "./schema";

/*
 * Jev's three jobs in a review, each called as a workflow step from review.ts: read a document, score an
 * application against the buyer's criteria, and decide who's approved. Answers are checked before they're
 * saved; anything malformed throws, so the workflow retries the step.
 */

/** Most text sent to Jev from one document. Certificates are a page or two; proposals can be long. */
const MAX_DOCUMENT_CHARS = 15_000;
/** Images larger than this aren't sent to Jev. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const today = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);

const JEV_ROLE =
  "You are Jev, the reviewer on YES Hub, a South African platform that matches SMEs with enterprise tenders, " +
  "RFQs and grants. You are careful, fair and factual: you only rely on what the documents and profile say, " +
  "you never invent values, and you explain your reasoning so a procurement officer could audit it.";

/* ------------------------------------------------------------------------------------------------------ */
/* Reading a document                                                                                     */
/* ------------------------------------------------------------------------------------------------------ */

async function readPdf(bytes: ArrayBuffer) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+\n/g, "\n").trim();
}

export const extractDocument = internalAction({
  args: { applicationId: v.id("applications"), key: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const input = await ctx.runQuery(internal.review.extractionInput, args);
    if (!input) return null;
    const { document, profile, sampleData } = input;

    const unreadable = (summary: string) =>
      ctx.runMutation(internal.review.saveExtraction, {
        ...args,
        status: "unreadable",
        documentType: "Unknown",
        matchesLabel: false,
        fields: [],
        issues: [summary],
        summary,
        excerpt: "",
      });

    const blob = await ctx.storage.get(document.storageId as Id<"_storage">);
    if (!blob) {
      await unreadable("The file is missing from storage.");
      return null;
    }

    let text = "";
    let image: string | null = null;
    if (document.type === "application/pdf") {
      try {
        text = await readPdf(await blob.arrayBuffer());
      } catch {
        await unreadable("The PDF couldn’t be opened. It may be damaged or password-protected.");
        return null;
      }
      if (text.length < 20) {
        await unreadable("No text could be read from the PDF. It may be a scan without a text layer.");
        return null;
      }
    } else if (document.type.startsWith("image/")) {
      if (blob.size > MAX_IMAGE_BYTES) {
        await unreadable("The image is too large to read.");
        return null;
      }
      image = `data:${document.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
    } else {
      await unreadable("Only PDFs and images can be read.");
      return null;
    }

    const instructions = [
      `Today is ${today()}. An SME submitted the document below as their "${document.label}".`,
      "Report what the document says and check it against the SME's profile.",
      "",
      "SME profile:",
      JSON.stringify(profile, null, 2),
      "",
      "List as issues: a different company name or registration number than the profile, an expiry date before",
      "today, a B-BBEE level different from the profile, a document that isn't what it was uploaded as, or anything",
      "that makes it unreliable (unsigned where a signature is expected, illegible, incomplete).",
      sampleData
        ? 'This is a demonstration account: documents marked "SAMPLE DOCUMENT FOR TESTING" are expected. Note it in the summary, but don\'t list it as an issue.'
        : 'A document marked as a sample or "not a real certificate" is an issue.',
      "",
      "Fields to report when present: company name, registration number, CSD supplier number, B-BBEE level,",
      "issue date, expiry or valid-until date (as yyyy-mm-dd), issuing body, and any amounts or references.",
      "",
      "Reply with JSON only, in this shape:",
      '{"documentType": "what the document is", "matchesLabel": true, "fields": [{"name": "Company name", "value": "..."}], "issues": ["..."], "summary": "one or two sentences"}',
    ].join("\n");

    const result = await askJev({
      system: JEV_ROLE,
      user: image
        ? [
            { type: "text", text: instructions },
            { type: "image_url", image_url: { url: image } },
          ]
        : `${instructions}\n\nDocument text:\n"""\n${text.slice(0, MAX_DOCUMENT_CHARS)}\n"""`,
      maxTokens: 4000,
      parse: (value) => {
        const o = asObject(value, "the document reading");
        const fields = Array.isArray(o.fields)
          ? o.fields.slice(0, 30).flatMap((f) => {
              const field = f && typeof f === "object" ? (f as Record<string, unknown>) : null;
              const name = asString(field?.name);
              const fieldValue = asString(field?.value);
              return name && fieldValue ? [{ name: clip(name, 100), value: clip(fieldValue, 300) }] : [];
            })
          : [];
        return {
          documentType: clip(asString(o.documentType, "Unknown"), 120),
          matchesLabel: asBoolean(o.matchesLabel) ?? false,
          fields,
          issues: asStrings(o.issues).map((i) => clip(i, 300)),
          summary: clip(asString(o.summary), 600),
        };
      },
    });

    await ctx.runMutation(internal.review.saveExtraction, {
      ...args,
      status: "read",
      ...result.answer,
      excerpt: image ? "(image)" : clip(text, 3000),
      call: { model: result.model, generationId: result.generationId, costUsd: result.costUsd },
    });
    return null;
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Scoring against the buyer's criteria                                                                   */
/* ------------------------------------------------------------------------------------------------------ */

export const assessApplication = internalAction({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args): Promise<null> => {
    const input = await ctx.runQuery(internal.review.assessmentInput, args);
    if (!input) return null;
    const { opportunity, rules } = input;
    const criteria = opportunity.criteria;

    const prompt = [
      `Today is ${today()}. Assess this application to a ${opportunity.kind} against the buyer's evaluation criteria.`,
      "",
      "Opportunity:",
      JSON.stringify({ ...opportunity, criteria: undefined }, null, 2),
      "",
      "Evaluation criteria, numbered. Kinds: gate = must be met (true/false); functionality = score 0-100,",
      "the number is the minimum to proceed; assessed = score 0-100; price and bbbee = YES Hub calculates the",
      "points with the preferential procurement formulas, so don't score them: for price, check a quote was",
      "submitted; for bbbee, set met to whether the B-BBEE certificate supports the level on the profile.",
      ...criteria.map((c, i) => `${i + 1}. [${c.kind}${c.points !== undefined ? `, ${c.points}` : ""}] ${c.criterion}`),
      "",
      "SME profile:",
      JSON.stringify(input.sme, null, 2),
      "",
      "Application:",
      JSON.stringify(input.application, null, 2),
      "",
      "What Jev read from the documents:",
      JSON.stringify(input.documents, null, 2),
      "",
      "YES Hub's eligibility rules (location, B-BBEE minimum, required documents, good standing):",
      JSON.stringify(
        rules.checks.filter((c) => c.required),
        null,
        2,
      ),
      "",
      "Scoring guide for functionality and assessed criteria: 0-39 no evidence, 40-59 weak, 60-79 adequate,",
      "80-100 strong, with evidence in the documents or proposal. Claims only on the profile count for less",
      "than the same claim backed by a document. Cite evidence as 'Document or source: what it shows'.",
      "",
      "qualifies is false only for a specific problem you can name in concerns, such as a gate not met, a",
      "functionality score under its minimum, or documents that contradict the profile. Otherwise true.",
      "score is your overall 0-100 view of how strong the application is.",
      "",
      "Reply with JSON only, in this shape:",
      '{"criteria": [{"number": 1, "met": true, "score": 70, "reasoning": "...", "evidence": ["..."]}], "qualifies": true, "score": 72, "summary": "two sentences", "concerns": ["..."]}',
      "Use met for gates and bbbee, score for functionality and assessed; omit what doesn't apply.",
    ].join("\n");

    const result = await askJev({
      system: JEV_ROLE,
      user: prompt,
      maxTokens: 6000,
      parse: (value) => {
        const o = asObject(value, "the assessment");
        const answers = Array.isArray(o.criteria) ? o.criteria : [];
        const assessed: CriterionAssessment[] = criteria.map((c, i) => {
          const raw = answers.find((a) => Number((a as Record<string, unknown>)?.number) === i + 1) ?? answers[i];
          const a = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
          const scored = c.kind === "functionality" || c.kind === "assessed";
          const judged = c.kind === "gate" || c.kind === "bbbee";
          return {
            criterion: c.criterion,
            kind: c.kind,
            points: c.points,
            met: judged ? (asBoolean(a.met) ?? (c.kind === "bbbee" ? undefined : false)) : undefined,
            score: scored ? (asScore(a.score) ?? 0) : undefined,
            reasoning: clip(
              asString(a.reasoning, c.kind === "price" ? "Calculated from the quote." : "No reasoning given."),
              800,
            ),
            evidence: asStrings(a.evidence, 8).map((e) => clip(e, 300)),
          };
        });
        const score = asScore(o.score);
        if (score === undefined) throw new JevError("The assessment had no overall score.");
        return {
          criteria: assessed,
          qualifies: asBoolean(o.qualifies) ?? true,
          score,
          summary: clip(asString(o.summary), 600),
          concerns: asStrings(o.concerns, 10).map((c) => clip(c, 300)),
        };
      },
    });
    const answer = result.answer;

    // Requirements combine YES Hub's rules (facts from the profile) with Jev's reading of each gate
    const checks: Evaluation["checks"] = [...rules.checks];
    answer.criteria.forEach((c, i) => {
      if (c.kind === "gate") {
        checks.push({
          id: `criterion-${i + 1}`,
          label: c.criterion,
          required: true,
          passed: c.met === true,
          detail: c.reasoning,
        });
      } else if (c.kind === "functionality") {
        const minimum = c.points ?? 0;
        checks.push({
          id: `criterion-${i + 1}`,
          label: minimum ? `Functionality of at least ${minimum}` : "Functionality",
          required: !!minimum,
          passed: (c.score ?? 0) >= minimum,
          detail: `Scored ${c.score}. ${c.reasoning}`,
        });
      }
    });
    const documentIssues = input.documents.flatMap((d) => d.issues.map((issue) => `${d.label}: ${issue}`));
    checks.push({
      id: "documents-consistent",
      label: "Documents consistent with the profile",
      required: false,
      passed: documentIssues.length === 0,
      detail: documentIssues.length ? documentIssues.slice(0, 3).join(" ") : "No problems found in the documents",
    });

    // Jev may only disqualify for a reason it states
    const jevDisqualifies = !answer.qualifies && answer.concerns.length > 0;
    const qualifies = checks.filter((c) => c.required).every((c) => c.passed) && !jevDisqualifies;
    const failed = checks.filter((c) => c.required && !c.passed).map((c) => c.label);

    await ctx.runMutation(internal.review.saveAssessment, {
      ...args,
      qualifies,
      // Same convention as the rules: an applicant who doesn't qualify never outranks one who does
      score: qualifies ? answer.score : Math.min(answer.score, 59),
      summary:
        qualifies || !failed.length ? answer.summary : `Doesn’t qualify: ${failed.join(", ")}. ${answer.summary}`,
      checks,
      criteria: answer.criteria,
      concerns: answer.concerns,
      call: { model: result.model, generationId: result.generationId, costUsd: result.costUsd },
    });
    return null;
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Deciding who's approved                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

const vCandidate = v.object({
  applicationId: v.id("applications"),
  companyName: v.string(),
  eligible: v.boolean(),
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

export const decide = internalAction({
  args: { runId: v.id("decisionRuns"), candidates: v.array(vCandidate) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    summary: string;
    decisions: { applicationId: Id<"applications">; approved: boolean; rationale: string }[];
    call: { model: string; generationId?: string; costUsd?: number };
  }> => {
    const input = await ctx.runQuery(internal.review.decisionInput, { runId: args.runId });
    if (!input) throw new Error("The decision run no longer exists.");

    // With nobody eligible there's nothing to judge: everyone's outcome follows from the rules
    if (!args.candidates.some((c) => c.eligible)) {
      return {
        summary: "No applicant met every requirement, so nobody was approved.",
        decisions: args.candidates.map((c) => ({
          applicationId: c.applicationId,
          approved: false,
          rationale: `Not approved because the application didn’t meet every requirement: ${c.ineligibleReasons.join("; ")}`,
        })),
        call: { model: "none (no eligible applicants)" },
      };
    }

    // Short references keep ids out of the prompt and make Jev's answer easy to check
    const refs = new Map(args.candidates.map((c, i) => [`A${i + 1}`, c]));
    const applicants = [...refs].map(([ref, c]: [string, Candidate]) => ({
      ref,
      company: c.companyName,
      eligible: c.eligible,
      ineligibleReasons: c.ineligibleReasons,
      rank: c.rank ?? null,
      quote: c.quote ?? null,
      pricePoints: c.pricePoints ?? null,
      bbbeePoints: c.bbbeePoints ?? null,
      totalPoints: c.totalPoints ?? null,
      jevScore: c.score,
      summary: c.summary,
      criteria: c.criteria,
      concerns: c.concerns,
    }));

    const prompt = [
      `Decide which applicants to approve for this ${input.opportunity.kind}. Approve at most ${input.slots}.`,
      "",
      "Opportunity:",
      JSON.stringify(input.opportunity, null, 2),
      "",
      "Applicants. Points were calculated by YES Hub with the preferential procurement formulas, and rank",
      "orders the eligible applicants by points:",
      JSON.stringify(applicants, null, 2),
      "",
      "Rules:",
      "- Only eligible applicants can be approved.",
      "- Follow the ranking. Approving a lower-ranked applicant over a higher-ranked one is only justified by",
      "  a concrete, documented concern about the higher-ranked one (objective criteria in procurement law);",
      "  say so explicitly in both rationales.",
      "- You may approve fewer than the maximum if the remaining applicants have serious concerns.",
      "- Give every applicant a rationale of one to three sentences that they could read: why they were or",
      "  weren't approved, citing points, criteria or documents. Never name or compare with other applicants.",
      "",
      "Reply with JSON only, in this shape:",
      '{"summary": "two or three sentences for the buyer", "decisions": [{"ref": "A1", "approved": true, "rationale": "..."}]}',
      "Include every applicant exactly once.",
    ].join("\n");

    const result = await askJev({
      system: JEV_ROLE,
      user: prompt,
      maxTokens: 8000,
      parse: (value) => {
        const o = asObject(value, "the decision");
        if (!Array.isArray(o.decisions)) throw new JevError("The decision had no decisions.");
        const seen = new Set<string>();
        const decisions = o.decisions.flatMap((d) => {
          const row = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
          const ref = asString(row.ref).toUpperCase();
          const candidate = refs.get(ref);
          if (!candidate || seen.has(ref)) return [];
          seen.add(ref);
          return [
            {
              applicationId: candidate.applicationId,
              approved: asBoolean(row.approved) ?? false,
              rationale: clip(asString(row.rationale, "No rationale given."), 800),
            },
          ];
        });
        return { summary: clip(asString(o.summary), 800), decisions };
      },
    });

    return {
      ...result.answer,
      call: { model: result.model, generationId: result.generationId, costUsd: result.costUsd },
    };
  },
});
