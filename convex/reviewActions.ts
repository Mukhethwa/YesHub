"use node";

import type { FunctionReturnType } from "convex/server";
import { v } from "convex/values";
import { extractText, getDocumentProxy } from "unpdf";

import { DOCUMENTS } from "../src/lib/sme/documents";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  type Answer,
  askJev,
  type ChoiceAnswer,
  clip,
  type NoulAnswer,
  percent,
  type Question,
  type ScoreAnswer,
} from "./lib/jev";
import { profileDocumentFor, rulePoints } from "./lib/tender";
import type { Candidate } from "./review";
import type { CriterionAssessment, Evaluation, RequirementResult } from "./schema";

/*
 * Jev's three jobs in a review, each called as a workflow step from review.ts: read a document, score an
 * application against the buyer's criteria, and check the shortlist. Jev answers typed questions with
 * probabilities (lib/jev.ts); every reason saved here is composed from those answers, the buyer's criteria
 * and the calculated points, so each one can be traced back to what it rests on.
 */

/** Most text sent to Jev from one document. Certificates are a page or two; proposals can be long. */
const MAX_DOCUMENT_CHARS = 15_000;

/** Most of a tender's returnables looked for in one document. */
const MAX_RETURNABLES = 40;

const today = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);

const yes = (p: number) => p >= 0.5;
const yesNo = (p: number) => `${yes(p) ? "Yes" : "No"}, ${percent(p)}`;

/** A rubric answer as 0–100, and how it reads. The level is the one the expected score rounds to, so the
 * words and the number always agree. */
function rubric(a: ScoreAnswer, levels: string[]) {
  const max = levels.length - 1;
  const expected = Math.max(0, Math.min(max, a.score));
  return {
    score: Math.round((expected / max) * 100),
    level: a.legend[String(Math.round(expected))] ?? levels[Math.round(expected)],
    confidence: a.confidence >= 0.05 ? `${percent(a.confidence)} confident` : "low confidence",
  };
}

/* ------------------------------------------------------------------------------------------------------ */
/* Reading a document                                                                                     */
/* ------------------------------------------------------------------------------------------------------ */

const OTHER_DOCUMENT = "Something else";
const APPLICATION_FILE = "Proposal, pricing schedule or returnable form";
const DOCUMENT_TYPES: Record<string, string> = {
  ...Object.fromEntries(DOCUMENTS.map((d) => [d.label, d.description])),
  [APPLICATION_FILE]: "A document written for this application: a proposal, a pricing schedule, a menu, an SBD form.",
  [OTHER_DOCUMENT]: "Not one of the documents above.",
};

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
    if (document.type !== "application/pdf") {
      await unreadable("Only PDF documents can be reviewed. Upload this document as a PDF.");
      return null;
    }
    let text = "";
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

    const profileDocument = DOCUMENTS.find((d) => d.key === document.key);
    const today_ = today();
    const questions: Record<string, Question> = {
      kind: {
        type: "choice",
        instructions: "What is the document in `document`?",
        criteria: DOCUMENT_TYPES,
      },
      issuedTo: {
        type: "noul",
        instructions: `Is the document issued to, or about, ${profile.companyName}${
          profile.registrationNumber ? ` (registration number ${profile.registrationNumber})` : ""
        }?`,
      },
      current: {
        type: "noul",
        instructions: `Is the document still valid on ${today_}? If it shows no expiry or valid-until date, answer true.`,
      },
      sample: {
        type: "noul",
        instructions: "Is the document marked as a sample, a test, or “not a real certificate”?",
      },
      complete: {
        type: "noul",
        instructions: "Is the document complete and readable: not cut off, garbled, or missing parts it refers to?",
      },
      ...(document.key === "bbbeeCertificate" && profile.bbbeeLevel
        ? {
            bbbee: {
              type: "noul" as const,
              instructions: `Does the document show B-BBEE ${profile.bbbeeLevel}, the level on the SME's profile?`,
            },
          }
        : {}),
    };
    // The tender's returnables: whether this document is (or contains) each one, and for forms whether that
    // part is filled in and signed. A bid pack can hold several, so each is its own question.
    const returnables = input.returnables.slice(0, MAX_RETURNABLES);
    returnables.forEach((r, i) => {
      questions[`has${i}`] = {
        type: "noul",
        instructions: `Is \`document\` the tender's returnable “${r.name}”, or does it contain it (as one of its pages or sections)?`,
      };
      if (r.action === "complete_and_sign")
        questions[`done${i}`] = {
          type: "noul",
          instructions: `If \`document\` contains “${r.name}”, is that part completed: every field filled in, signed and dated, with no blank lines, empty boxes or placeholders left? Answer false if it isn't in the document.`,
        };
    });

    const result = await askJev({
      state: { today: today_, uploadedAs: document.label, profile, document: text.slice(0, MAX_DOCUMENT_CHARS) },
      questions,
    });
    const a = result.answers as Record<string, Answer>;
    const kind = a.kind as Extract<Answer, { type: "choice" }>;
    const p = (name: string) => (a[name] as Extract<Answer, { type: "noul" }> | undefined)?.noul;

    const documentType = kind.choice;
    const matchesLabel = profileDocument ? documentType === profileDocument.label : documentType !== OTHER_DOCUMENT;
    const issues: string[] = [];
    if (!matchesLabel)
      issues.push(
        `Reads as “${documentType}” (${percent(kind.confidence)}), not the ${document.label} it was sent as.`,
      );
    if (!yes(p("issuedTo")!))
      issues.push(`May not be issued to ${profile.companyName} (${percent(p("issuedTo")!)} that it is).`);
    if (!yes(p("current")!))
      issues.push(`May have expired before ${today_} (${percent(p("current")!)} that it’s still valid).`);
    if (p("bbbee") !== undefined && !yes(p("bbbee")!))
      issues.push(`May not show ${profile.bbbeeLevel} (${percent(p("bbbee")!)} that it does).`);
    if (yes(p("sample")!) && !sampleData)
      issues.push(`Marked as a sample or test document (${percent(p("sample")!)}).`);
    if (!yes(p("complete")!))
      issues.push(`May be incomplete or hard to read (${percent(p("complete")!)} that it’s complete).`);

    const fields = [
      { name: "Reads as", value: `${documentType} (${percent(kind.confidence)} confident)` },
      { name: `Issued to ${profile.companyName}`, value: yesNo(p("issuedTo")!) },
      { name: `Valid on ${today_}`, value: yesNo(p("current")!) },
      ...(p("bbbee") !== undefined ? [{ name: `Shows ${profile.bbbeeLevel}`, value: yesNo(p("bbbee")!) }] : []),
      { name: "Complete and readable", value: yesNo(p("complete")!) },
      { name: "Marked as a sample", value: yesNo(p("sample")!) },
    ];
    returnables.forEach((r, i) => {
      if (!yes(p(`has${i}`)!)) return;
      const done = p(`done${i}`);
      fields.push({
        name: `Contains ${r.name}`,
        value: `${yesNo(p(`has${i}`)!)}${done !== undefined ? `; completed and signed: ${yesNo(done).toLowerCase()}` : ""}`,
      });
    });
    const summary = issues.length
      ? `Reads as ${documentType}. ${issues.length} check${issues.length === 1 ? "" : "s"} need${issues.length === 1 ? "s" : ""} a look.`
      : `Reads as ${documentType}, issued to ${profile.companyName} and valid. Every check passed.${
          sampleData && yes(p("sample")!) ? " Marked as sample data, as expected for a demonstration account." : ""
        }`;

    await ctx.runMutation(internal.review.saveExtraction, {
      ...args,
      status: "read",
      documentType,
      matchesLabel,
      fields,
      issues,
      summary,
      excerpt: clip(text, 3000),
      returnables: returnables.map((r, i) => ({ id: r.id, contains: p(`has${i}`)!, completed: p(`done${i}`) })),
      call: { model: result.model, costUsd: result.costUsd },
    });
    return null;
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Scoring against the buyer's criteria                                                                   */
/* ------------------------------------------------------------------------------------------------------ */

/** How strong the evidence is for a functionality or assessed criterion. Level 4 is 100. */
const EVIDENCE_RUBRIC = [
  "No evidence for this criterion",
  "Weak evidence: a claim with little support",
  "Some relevant evidence, with gaps",
  "Clear, relevant evidence",
  "Strong, specific evidence backed by documents or references",
];
/** How well the whole application fits, on the evaluation criteria only. */
const FIT_RUBRIC = ["Not suited", "Weak fit", "Adequate", "Good fit", "Strong fit"];

/* ------------------------------------------------------------------------------------------------------ */
/* Checking against the tender's own requirements                                                         */
/* ------------------------------------------------------------------------------------------------------ */

type AssessmentInput = NonNullable<FunctionReturnType<typeof internal.review.assessmentInput>>;
type Register = NonNullable<AssessmentInput["tender"]>;

const NOTHING = "Nothing shows it";
const NO_RULE = "None of these";

/** Where evidence can come from, as choices for "which of these shows it". */
function evidenceSources(input: AssessmentInput) {
  return {
    ...Object.fromEntries(
      input.documents.map((d) => [`${d.label} (${d.name})`, `The document ${d.name}, sent as ${d.label}.`]),
    ),
    ...(input.application.proposal ? { "Your proposal": "The written proposal sent with the application." } : {}),
    "Your profile": "The SME's MASLink profile: services, capabilities, accreditations, years trading.",
    [NOTHING]: "None of the documents, the proposal or the profile shows it.",
  };
}

/** Questions for every requirement in the register, keyed so the answers can be matched back. */
function requirementQuestions(register: Register, input: AssessmentInput) {
  const questions: Record<string, Question> = {};
  const sources = evidenceSources(input);
  for (const r of register.requirements) {
    if (r.kind === "mandatory") {
      questions[`m_${r.id}`] = {
        type: "noul",
        instructions: `Mandatory requirement in the tender: “${r.text}”. Does the evidence (documents, proposal and profile) show the applicant meets it?`,
      };
      questions[`w_${r.id}`] = {
        type: "choice",
        instructions: `Which of these best shows the applicant meets “${clip(r.text, 300)}”?`,
        criteria: sources,
      };
    } else if (r.kind === "scored") {
      (r.items ?? []).forEach((item, k) => {
        questions[`i_${r.id}_${k}`] = {
          type: "noul",
          instructions: `For the tender criterion “${clip(r.text, 200)}”: does the application show “${item}”?`,
        };
      });
      const rules = (r.scoring ?? []).filter((rule) => rulePoints(rule) !== undefined);
      if (rules.length) {
        questions[`p_${r.id}`] = {
          type: "choice",
          instructions: `The tender scores “${clip(r.text, 300)}” with these rules. Which one does the evidence meet? Choose the highest-scoring rule that is fully met.`,
          criteria: {
            ...Object.fromEntries(rules.map((rule) => [rule, rule])),
            [NO_RULE]: "The evidence doesn't meet any of the rules.",
          },
        };
      } else if (!(r.items ?? []).length) {
        questions[`p_${r.id}`] = {
          type: "score",
          instructions: `Rate the evidence for the tender criterion “${r.text}”. Count what the documents and proposal show; a claim made only on the profile counts for less.`,
          criteria: EVIDENCE_RUBRIC,
        };
      }
      questions[`w_${r.id}`] = {
        type: "choice",
        instructions: `Which of these gives the strongest evidence for “${clip(r.text, 300)}”?`,
        criteria: sources,
      };
    }
  }
  return questions;
}

/** Scored points to one decimal place. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Each requirement's result: what the application has, what the SME still needs, and the points scored. */
function requirementResults(register: Register, input: AssessmentInput, a: Record<string, Answer>) {
  const noul = (name: string) => (a[name] as NoulAnswer | undefined)?.noul;
  const choice = (name: string) => a[name] as ChoiceAnswer | undefined;
  const shownIn = (name: string) => {
    const c = choice(name);
    return c && c.choice !== NOTHING ? `Best evidence: ${c.choice}` : null;
  };

  return register.requirements.flatMap((r): RequirementResult[] => {
    if (r.kind === "mandatory") {
      const p = noul(`m_${r.id}`) ?? 0;
      const where = shownIn(`w_${r.id}`);
      return [
        {
          id: r.id,
          status: p >= 0.6 ? "met" : p >= 0.4 ? "partial" : "missing",
          has:
            p >= 0.4
              ? [
                  `${p >= 0.6 ? "Shown" : "Partly shown"} by the evidence (${percent(p)} sure)`,
                  ...(where ? [where] : []),
                ]
              : [],
          needs:
            p >= 0.6
              ? []
              : [
                  p >= 0.4
                    ? "The evidence for this is unclear. Add a document that shows it plainly, or explain it in your proposal."
                    : "Nothing you sent shows this. Add a document (a certificate, letter or reference) or explain it in your proposal.",
                ],
          confidence: Math.abs(p - 0.5) * 2,
        },
      ];
    }

    if (r.kind === "scored") {
      const items = r.items ?? [];
      const have = items.filter((_, k) => yes(noul(`i_${r.id}_${k}`) ?? 0));
      const lacking = items.filter((item) => !have.includes(item));
      const available = r.points ?? 0;
      const answer = a[`p_${r.id}`];
      const rules = (r.scoring ?? []).filter((rule) => rulePoints(rule) !== undefined);
      let points: number;
      let confidence = 1;
      const has: string[] = [];
      const needs: string[] = [];
      if (answer?.type === "choice") {
        points = answer.choice === NO_RULE ? 0 : (rulePoints(answer.choice) ?? 0);
        confidence = answer.confidence;
        if (points > 0) has.push(`Meets “${answer.choice}”`);
        // The next rule up is what the SME needs to reach to score more
        const better = rules
          .filter((rule) => (rulePoints(rule) ?? 0) > points)
          .sort((x, y) => (rulePoints(x) ?? 0) - (rulePoints(y) ?? 0))[0];
        if (better) needs.push(`To score more, meet “${better}”.`);
      } else if (answer?.type === "score") {
        const level = rubric(answer, EVIDENCE_RUBRIC);
        points = round1((available * level.score) / 100);
        confidence = answer.confidence;
        has.push(`Evidence rated “${level.level}”`);
        if (level.score < 100)
          needs.push("Strengthen the evidence: references, CVs, certificates or examples of similar work.");
      } else {
        // Points for the share of listed items shown
        points = items.length ? round1((available * have.length) / items.length) : 0;
      }
      points = Math.min(points, available || points);
      if (items.length)
        has.unshift(`${have.length} of ${items.length} listed: ${have.length ? have.join("; ") : "none"}`);
      if (lacking.length) needs.unshift(`Show evidence of: ${lacking.join("; ")}.`);
      const where = shownIn(`w_${r.id}`);
      if (where && points > 0) has.push(where);
      return [
        {
          id: r.id,
          status: available && points >= available ? "met" : points > 0 ? "partial" : "missing",
          has,
          needs: available && points >= available ? [] : needs.length ? needs : ["Add evidence for this criterion."],
          points,
          confidence,
        },
      ];
    }

    if (r.kind === "returnable") {
      if (r.action === "review") return [];
      const profileKey = profileDocumentFor(r.text);
      const profileReading = profileKey ? input.documents.find((d) => d.key === profileKey) : undefined;
      // A profile document only answers its own kind of returnable: a CSD number printed on the CIPC
      // certificate isn't the CSD report. Files attached to the application can answer anything.
      const found = input.documents
        .filter((d) => d.source === "application" || d.key === profileKey)
        .flatMap((d) =>
          d.returnables.filter((x) => x.id === r.id && yes(x.contains)).map((x) => ({ document: d, ...x })),
        )
        .sort((x, y) => y.contains - x.contains);
      const best = found[0];
      if (best) {
        const signed = r.action === "complete_and_sign" ? best.completed : undefined;
        const complete = signed === undefined || yes(signed);
        return [
          {
            id: r.id,
            status: complete ? "met" : "partial",
            has: [`Found in ${best.document.name}${signed !== undefined && complete ? ", completed and signed" : ""}`],
            needs: complete
              ? []
              : [`It looks incomplete: fill in every field, sign and date it, then send ${r.text} again.`],
            confidence: Math.min(best.contains, signed ?? 1),
          },
        ];
      }
      if (profileReading && profileReading.status === "read") {
        return [
          {
            id: r.id,
            status: profileReading.issues.length ? "partial" : "met",
            has: [`${profileReading.label} on your profile`],
            needs: profileReading.issues.slice(0, 2).map((issue) => `${profileReading.label}: ${issue}`),
            confidence: 1,
          },
        ];
      }
      const label = profileKey ? (DOCUMENTS.find((d) => d.key === profileKey)?.label ?? r.text) : r.text;
      if (profileReading) {
        return [
          {
            id: r.id,
            status: "partial",
            has: [`${label} on your profile`],
            needs: [`Your ${label} couldn’t be read. Upload it again as a PDF on your Documents tab.`],
            confidence: 1,
          },
        ];
      }
      return [
        {
          id: r.id,
          status: "missing",
          has: [],
          needs: [
            profileKey
              ? `Upload your ${label} on your Documents tab. It then counts for this tender and every other one.`
              : r.action === "complete_and_sign"
                ? `Complete and sign ${r.text}, then attach it.`
                : `Attach ${r.text}.`,
          ],
          confidence: 1,
        },
      ];
    }
    return [];
  });
}

export const assessApplication = internalAction({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args): Promise<null> => {
    const input = await ctx.runQuery(internal.review.assessmentInput, args);
    if (!input) return null;
    const { opportunity, rules } = input;
    const register = input.tender;
    const tenderScores = !!register?.requirements.some((r) => r.kind === "scored");
    // The tender's scored criteria replace the listing's judged ones; price and B-BBEE are still calculated
    const criteria = tenderScores
      ? opportunity.criteria.filter((c) => c.kind !== "functionality" && c.kind !== "assessed")
      : opportunity.criteria;

    const questions: Record<string, Question> = {
      fit: {
        type: "score",
        instructions:
          "How well does the application fit the opportunity, judged only on the evaluation criteria and the evidence in the documents and proposal?",
        criteria: FIT_RUBRIC,
      },
      contradicts: {
        type: "noul",
        instructions:
          "Do the documents contradict the SME's profile, for example a different company name, registration number or B-BBEE level?",
      },
    };
    criteria.forEach((c, i) => {
      if (c.kind === "gate") {
        questions[`c${i}`] = {
          type: "noul",
          instructions: `Requirement: “${c.criterion}”. Does the evidence (documents, proposal and profile) show the applicant meets it?`,
        };
      } else if (c.kind === "bbbee") {
        questions[`c${i}`] = {
          type: "noul",
          instructions: `Does the applicant's B-BBEE evidence support the level on their profile (${input.sme.bbbeeLevel})?`,
        };
      } else if (c.kind === "functionality" || c.kind === "assessed") {
        questions[`c${i}`] = {
          type: "score",
          instructions: `Rate the evidence for this criterion: “${c.criterion}”. Count what the documents and proposal show; a claim made only on the profile counts for less.`,
          criteria: EVIDENCE_RUBRIC,
        };
      }
    });

    if (register) Object.assign(questions, requirementQuestions(register, input));

    const result = await askJev({
      state: {
        today: today(),
        opportunity: { ...opportunity, criteria: criteria.map((c) => c.criterion) },
        sme: input.sme,
        application: input.application,
        documents: input.documents,
        eligibility: rules.checks.filter((c) => c.required).map((c) => ({ check: c.label, passed: c.passed })),
      },
      questions,
    });
    const a = result.answers as Record<string, Answer>;

    // What every criterion was judged on, for the record
    const evidence = [
      ...input.documents.map((d) =>
        clip(
          `${d.label}: ${d.status === "unreadable" ? "couldn’t be read" : d.issues.length ? d.issues[0] : "checks passed"}`,
          300,
        ),
      ),
      input.application.proposal ? "Proposal: included with the application" : "Proposal: none",
    ].slice(0, 8);

    const assessed: CriterionAssessment[] = criteria.map((c, i) => {
      const answer = a[`c${i}`];
      if (c.kind === "price") {
        return {
          criterion: c.criterion,
          kind: c.kind,
          points: c.points,
          reasoning: input.application.quote ? "Points are calculated from the quote." : "No quote was submitted.",
          evidence: [],
        };
      }
      if (answer?.type === "noul") {
        return {
          criterion: c.criterion,
          kind: c.kind,
          points: c.points,
          met: yes(answer.noul),
          reasoning: `${yes(answer.noul) ? "Met" : "Not met"}: ${percent(answer.noul)} that the evidence shows it.`,
          evidence,
        };
      }
      const r = rubric(answer as ScoreAnswer, EVIDENCE_RUBRIC);
      return {
        criterion: c.criterion,
        kind: c.kind,
        points: c.points,
        score: r.score,
        reasoning: `Rated “${r.level}”: ${r.score}/100 (${r.confidence}).`,
        evidence,
      };
    });

    const fit = rubric(a.fit as ScoreAnswer, FIT_RUBRIC);
    const contradicts = (a.contradicts as Extract<Answer, { type: "noul" }>).noul;
    const concerns = yes(contradicts)
      ? [`The documents may contradict the profile (${percent(contradicts)}). Check the document readings.`]
      : [];

    // Requirements combine MASLink's rules (facts from the profile) with Jev's reading of each gate
    const checks: Evaluation["checks"] = [...rules.checks];
    assessed.forEach((c, i) => {
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
          detail: c.reasoning,
        });
      }
    });
    // The tender's own requirements: mandatory ones and mandatory returnables decide eligibility, and the
    // scored criteria are totalled against the tender's minimum
    const results = register ? requirementResults(register, input, a) : undefined;
    let technical: Evaluation["technical"];
    if (register && results) {
      const byId = new Map(results.map((r) => [r.id, r]));
      for (const r of register.requirements) {
        const result = byId.get(r.id);
        if (!result) continue;
        const mandatory = r.kind === "mandatory" || (r.kind === "returnable" && r.tier === "mandatory");
        if (!mandatory) continue;
        checks.push({
          id: `tender-${r.id}`,
          label: clip(r.kind === "returnable" ? `${r.text} (mandatory returnable)` : r.text, 140),
          required: true,
          passed: result.status === "met",
          detail: [...result.has, ...result.needs].join(" ") || "Checked against the tender",
        });
      }
      const scored = register.requirements.filter((r) => r.kind === "scored");
      if (scored.length) {
        technical = {
          points: round1(scored.reduce((sum, r) => sum + (byId.get(r.id)?.points ?? 0), 0)),
          available: round1(scored.reduce((sum, r) => sum + (r.points ?? 0), 0)),
          threshold: register.threshold,
        };
        if (register.threshold !== undefined)
          checks.push({
            id: "tender-threshold",
            label: `Technical score of at least ${register.threshold}`,
            required: true,
            passed: technical.points >= register.threshold,
            detail: `Scored ${technical.points} of ${technical.available} technical points on the evidence.`,
          });
      }
    }

    const documentIssues = input.documents.flatMap((d) => d.issues.map((issue) => `${d.label}: ${issue}`));
    checks.push({
      id: "documents-consistent",
      label: "Documents consistent with the profile",
      required: false,
      passed: documentIssues.length === 0,
      detail: documentIssues.length ? documentIssues.slice(0, 3).join(" ") : "No problems found in the documents",
    });

    // Jev can only disqualify through a concern it can name: the documents contradicting the profile
    const qualifies = checks.filter((c) => c.required).every((c) => c.passed) && concerns.length === 0;
    const failed = checks.filter((c) => c.required && !c.passed).map((c) => c.label);
    // Returnable documents in order: the standard ones on the SME's profile and the tender's own forms
    const returnables =
      register && results
        ? (() => {
            const ids = new Set(register.requirements.filter((r) => r.kind === "returnable").map((r) => r.id));
            const ours = results.filter((r) => ids.has(r.id));
            return {
              met: ours.filter((r) => r.status === "met").length,
              partial: ours.filter((r) => r.status === "partial").length,
              total: ours.length,
            };
          })()
        : undefined;

    // With a confirmed tender the score is the tender's own: technical points on its scoring rules, or, when
    // it only scores price and preference (calculated at shortlisting), how many returnables are in order.
    // Without one, it's the average of the buyer's scored criteria, or the overall fit.
    const scored = assessed.flatMap((c) => (c.score !== undefined ? [c.score] : []));
    const score =
      technical && technical.available > 0
        ? Math.round((technical.points / technical.available) * 100)
        : returnables && returnables.total > 0
          ? Math.round((returnables.met / returnables.total) * 100)
          : scored.length
            ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
            : fit.score;
    const gates = assessed.filter((c) => c.kind === "gate");
    const mandatory = register
      ? register.requirements.filter((r) => r.kind === "mandatory").map((r) => results!.find((x) => x.id === r.id))
      : [];
    const summary = register
      ? [
          technical &&
            `${technical.points} of ${technical.available} technical points${
              technical.threshold !== undefined ? ` (minimum ${technical.threshold})` : ""
            }.`,
          mandatory.length &&
            `${mandatory.filter((m) => m?.status === "met").length} of ${mandatory.length} mandatory requirements shown.`,
          returnables?.total && `${returnables.met} of ${returnables.total} returnable documents in order.`,
        ]
          .filter(Boolean)
          .join(" ")
      : `Overall “${fit.level}” (${fit.confidence}).${
          gates.length
            ? ` ${gates.filter((g) => g.met).length} of ${gates.length} requirements shown by the evidence.`
            : ""
        }`;

    await ctx.runMutation(internal.review.saveAssessment, {
      ...args,
      qualifies,
      // A tender's points are reported as they are; ranking already puts applicants who qualify first. Without
      // one, the rules' convention holds: an applicant who doesn't qualify never outranks one who does.
      score: qualifies || register ? score : Math.min(score, 59),
      returnables,
      summary: qualifies || !failed.length ? summary : `Doesn’t qualify: ${failed.join(", ")}. ${summary}`,
      checks,
      criteria: assessed,
      concerns,
      requirements: results,
      technical,
      call: { model: result.model, costUsd: result.costUsd },
    });
    return null;
  },
});

/* ------------------------------------------------------------------------------------------------------ */
/* Recommending a shortlist                                                                               */
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

/** The order shortlisting follows: rank by points, then points, then the review's score. */
const byRank = (a: Candidate, b: Candidate) =>
  (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.totalPoints ?? -1) - (a.totalPoints ?? -1) || b.score - a.score;

const pointsText = (c: Candidate) =>
  c.totalPoints === undefined
    ? `a review score of ${c.score}/100`
    : `${c.totalPoints} points${
        c.pricePoints !== undefined || c.bbbeePoints !== undefined
          ? ` (${[
              c.pricePoints !== undefined ? `price ${c.pricePoints}` : null,
              c.bbbeePoints !== undefined ? `B-BBEE ${c.bbbeePoints}` : null,
            ]
              .filter(Boolean)
              .join(", ")})`
          : ""
      }`;

export const decide = internalAction({
  args: { runId: v.id("decisionRuns"), candidates: v.array(vCandidate) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    summary: string;
    decisions: { applicationId: Id<"applications">; shortlisted: boolean; rationale: string }[];
    call: { model: string; costUsd?: number };
  }> => {
    const input = await ctx.runQuery(internal.review.decisionInput, { runId: args.runId });
    if (!input) throw new Error("The decision run no longer exists.");

    const notEligible = (c: Candidate) => ({
      applicationId: c.applicationId,
      shortlisted: false,
      rationale: `Not shortlisted. Requirements not met: ${c.ineligibleReasons.join("; ")}.`,
    });

    const eligible = args.candidates.filter((c) => c.eligible).sort(byRank);
    // With nobody eligible there's nothing to judge: everyone's outcome follows from the rules
    if (eligible.length === 0) {
      return {
        summary: "No application met every requirement. Nobody was shortlisted.",
        decisions: args.candidates.map(notEligible),
        call: { model: "none (no eligible applicants)" },
      };
    }

    // Jev's one judgement here: whether an applicant's recorded concern is serious enough to keep it off. Only
    // applicants with a concern are asked about, so nobody is held back without a reason they can read. Short
    // references keep ids and company names out of the request.
    const refs = eligible.map((c, i) => ({ ref: `A${i + 1}`, candidate: c }));
    const withConcerns = refs.filter(({ candidate }) => candidate.concerns.length > 0);
    const result = withConcerns.length
      ? await askJev({
          state: {
            opportunity: input.opportunity,
            applicants: withConcerns.map(({ ref, candidate: c }) => ({
              ref,
              rank: c.rank ?? null,
              points: c.totalPoints ?? null,
              reviewScore: c.score,
              criteria: c.criteria,
              concerns: c.concerns,
            })),
          },
          questions: Object.fromEntries(
            withConcerns.map(({ ref }) => [
              ref,
              {
                type: "noul" as const,
                instructions: `Is the concern recorded for applicant ${ref} serious enough, under the evaluation criteria, to keep it off the shortlist? Ignore names, places and anything about people.`,
              },
            ]),
          ),
        })
      : null;

    const slots = input.slots;
    const decisions: { applicationId: Id<"applications">; shortlisted: boolean; rationale: string }[] = [];
    let filled = 0;
    let heldBack = 0;
    refs.forEach(({ ref, candidate: c }, i) => {
      const answer = result?.answers[ref] as Extract<Answer, { type: "noul" }> | undefined;
      const position = `ranked ${c.rank ?? i + 1} of ${eligible.length} eligible applicants with ${pointsText(c)}`;
      if (filled < slots && answer && yes(answer.noul)) {
        heldBack++;
        decisions.push({
          applicationId: c.applicationId,
          shortlisted: false,
          rationale: `Not shortlisted: ${position}, but this concern keeps it off (${percent(answer.noul)}): ${c.concerns[0]}`,
        });
      } else if (filled < slots) {
        filled++;
        decisions.push({ applicationId: c.applicationId, shortlisted: true, rationale: `Shortlisted: ${position}.` });
      } else {
        decisions.push({
          applicationId: c.applicationId,
          shortlisted: false,
          rationale: `Not shortlisted: ${position}. The ${slots} place${slots === 1 ? "" : "s"} went to higher-ranked applicants.`,
        });
      }
    });
    decisions.push(...args.candidates.filter((c) => !c.eligible).map(notEligible));

    return {
      summary: `${filled} shortlisted from ${eligible.length} eligible of ${args.candidates.length} applicants, in points order${
        heldBack ? `; ${heldBack} held back for a documented concern` : ""
      }. The buyer makes the final decision.`,
      decisions,
      call: result ? { model: result.model, costUsd: result.costUsd } : { model: "none (no concerns to weigh)" },
    };
  },
});
