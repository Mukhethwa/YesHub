/*
 * Reading a tender document into a requirements register. PDF text arrives in reading order with table
 * cells split across lines, so this module rebuilds whole statements (segmentTender), lets Jev classify
 * each one (tenderActions.ts), then groups the classified statements into requirements (groupRequirements):
 * a scored criterion keeps its listed items and scoring rules, returnables are named once with their tier,
 * and the tender's own wording is kept so the buyer and SMEs read what the tender says.
 *
 * Pure functions: no Convex or Node imports, so they're easy to run against sample tenders.
 */

export type TenderSegment = { text: string; page: number };

/** What a statement in a tender is, as Jev is asked to classify it. */
export const SEGMENT_KINDS = {
  mandatory: "Something bidders must meet or demonstrate; not meeting it disqualifies them.",
  scored: "Something evaluated for points or a percentage, e.g. a technical criterion with a weighting.",
  returnable: "A document, form, certificate, schedule or annexure bidders must submit, complete or sign.",
  condition: "A rule of the process: closing date, briefing or site meeting, validity, grading, how to submit.",
  other: "Background, headings, definitions, contact details or legal terms; not a requirement.",
} as const;
export type SegmentKind = keyof typeof SEGMENT_KINDS;

export type RequirementKind = "mandatory" | "scored" | "returnable" | "condition";
export type RequirementAction = "submit" | "complete_and_sign" | "review" | "demonstrate";
/** How a missing returnable is treated: disqualifies, may disqualify, or only loses points. */
export type ReturnableTier = "mandatory" | "essential" | "scoring";

export type DraftRequirement = {
  kind: RequirementKind;
  /** The tender's own wording, tidied. */
  text: string;
  /** Points or percentage available, for scored criteria. */
  points?: number;
  /** How a scored criterion awards its points, as the tender states it. */
  scoring?: string[];
  /** Listed items a scored criterion counts, e.g. the skills or accreditations it lists. */
  items?: string[];
  /** For returnables: what the bidder has to do with it. */
  action?: RequirementAction;
  /** For returnables: what happens if it's missing, when the tender says. */
  tier?: ReturnableTier;
  page: number;
  /** Jev's confidence in the classification, 0 to 1. */
  confidence: number;
};

/** Lines that start a new statement: numbered items, bullets, tables, annexures, questions, scoring rules. */
const STARTS =
  /^(\d+(\.\d+)*\.?\s|[•▪\-–]\s|Table\s\d|Annexure\s[A-Z]\b|ANNEXURE\s[A-Z]\b|Phase\s\d|(Does|Is|Are|Has|Have|Will|Can)\s|Bidders?\s(has|have|does|did|complies|comply|is)\b|Not\savailable|NB[.:])/;
/** Contents-page lines: a title followed by a run of dots. */
const CONTENTS = /\.{5,}|…{3,}/;
/** Table titles and column headers that run into the first row of the table. */
const TABLE_RESIDUE = [
  /^Table\s\d+[A-Z]?:\s[^()]*(\([^)]*\))?\s*/i,
  /\bDocument\s+Action required\s*(Weighting)?\s*/i,
  /\bItem No\.\s*Criteria\s*Description\s*Max\s*Scoring\s*Points\s*/i,
  /\bNo\.\s*Classification\s*Turnover\s*Submission Requirement\s*/i,
  /^Bidders must demonstrate on their proposals the following\s*/i,
];

export function segmentTender(pages: string[]): TenderSegment[] {
  const segments: TenderSegment[] = [];
  pages.forEach((pageText, index) => {
    const page = index + 1;
    let current = "";
    const flush = () => {
      let text = current.replace(/\s+/g, " ").trim();
      for (const residue of TABLE_RESIDUE) text = text.replace(residue, "").trim();
      if (text.length >= 8 && !CONTENTS.test(text)) segments.push({ text, page });
      current = "";
    };
    for (const raw of pageText.split("\n")) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line) continue;
      // A statement ends at a sentence, a question, a colon, or a weighting ("14,29", "30%", "= 5")
      const ended = /[.?:;]$/.test(current) || /(\d+,\d+|\d+\s*%|=\s*\d+)$/.test(current);
      if (current && (STARTS.test(line) || ended)) flush();
      current = current ? `${current} ${line}` : line;
    }
    flush();
  });
  // The same statement on two pages (running headers) only counts once
  const seen = new Set<string>();
  return segments.filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)));
}

const POINTS = /(\d+(?:[.,]\d+)?)\s*(%|points?)/i;
/** A rule for awarding a criterion's points, e.g. "Bidder complies on 4 of the listed skills = 2%". */
const SCORING_RULE =
  /=\s*\d+(?:[.,]\d+)?\s*%?|^(bidders?\s(has|have|does|did|complies|comply)\b|not\savailable|of\s(the\s)?\d)/i;
/** A sub-item a criterion lists, e.g. "3. Cyber Security (Provide the latest cyber security certification)". */
const LIST_ITEM = /^\d\.\s+\S/;
/** A numbered criterion heading, e.g. "3.2 Service Provider accreditations" or "4 Previous Experience". */
const CRITERION_START = /^\d+(\.\d+)?\s+[A-Z]/;
/** Section titles and phase summaries that aren't requirements themselves. */
const HEADING = /^(evaluation criteria$|phase\s\d\b|total points|\d+\s*=\s*threshold|\d+(\.\d+)*\.?\s+annexures$)/i;
/** An all-capitals section title, e.g. "7 EVALUATION AND SELECTION CRITERIA" (case matters here). */
const CAPS_TITLE = /^\d+(\.\d+)*\.?\s+[A-Z][A-Z\s/&-]+:?$/;
/** A heading that introduces a list ("2.2. Essential Returnable documents:"). */
const LIST_HEADING = /:\s*$/;
/** What happens when a requirement isn't met: context for the requirement, not one itself. */
const CONSEQUENCE = /^(nb:?\s*)?(failure to|bidders who fail|if the bidder fails)|will lead to the disqualification/i;
/** Statements inside a declaration form ("14.3 The bidder has arrived at…"): part of the form, not requirements. */
const DECLARATION = /^(\d+(\.\d+)*\.?\s+)?(I|We|The bidder has|There have been|In addition|The terms of)\b/;
/** The conditions an SME has to act on. The rest of a tender's conditions are the buyer's rights. */
const KEY_CONDITION =
  /compulsory briefing|briefing session|site (meeting|visit|inspection)|cidb|grading|closing (date|time)|bid closing|validity period|price validity|late (bids|tenders|submissions)/i;
/** A buyer's reserved rights, listed as "a) …" or "9.1.4 To cancel…": not something the SME acts on. */
const RESERVATION = /^([a-z]\)\s|\d+(\.\d+){2,}\s+To\s)/;
/** Words a returnable's name contains: what makes "SBD1 Form" a document and "Position: Position:" a form field. */
const DOCUMENT_WORD =
  /form|certificate|declaration|schedule|annexure|sbd\s?\d|letter|proof|policy|profile|statement|agreement|resolution|affidavit|registration|report|\bpin\b|plan|proposal|matrix|quotation|bill of|\bboq\b|information|specification|criteria|ethics|document|disclosure|permit|licen[cs]e|clearance|\bcsd\b|b-?bbee|cidb|psira|coida/i;
/** Form fields and table cells: blanks, "Name:" labels, column headers. */
const FORM_FIELD =
  /_{3,}|:\s*\S*:|^(full name|name|position|signature|date|place|item|if so|where found|nature of|i certify)\b/i;
/** Headings that say which tier the returnables under them belong to. */
const TIERS: [RegExp, ReturnableTier][] = [
  [/mandatory returnable/i, "mandatory"],
  [/essential returnable/i, "essential"],
  [/used for scoring|returnable documents for scoring/i, "scoring"],
  [/returnable administrative|administrative documents/i, "essential"],
];

const parsePoints = (text: string) => {
  const m = POINTS.exec(text);
  return m ? Number(m[1].replace(",", ".")) : undefined;
};

/** The tender's wording without trailing weightings or table residue. */
function tidy(text: string) {
  return text
    .replace(/\s*(Demonstrate on the Proposal|Provide evidence in a proposal format)\s*/gi, " ")
    .replace(/\s+\d+(,\d+)?\s*%?\s*$/, "")
    .replace(/^[•▪\-–]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a returnable asks the bidder to do, from the tender's "action required" wording. */
function actionOf(text: string): RequirementAction {
  if (/complete.*sign|sign.*submit|fill in|complete and|completed/i.test(text)) return "complete_and_sign";
  if (/please review|review this|read and/i.test(text)) return "review";
  if (/demonstrate|proposal format|provide evidence/i.test(text)) return "demonstrate";
  // Forms and declarations are filled in and signed, even when the tender only says "submit"
  if (/\bform\b|declaration|disclosure|\bsbd\s?\d|resolution|consent|protection of personal information/i.test(text))
    return "complete_and_sign";
  return "submit";
}

/** A returnable's name: the document, without its list number or the action the tender asks for. */
function returnableName(text: string) {
  return tidy(text)
    .replace(/^\d+(\.\d+)*\.?\s+/, "")
    .replace(/\s+(please|kindly|provide|submit|failure to)\b.*$/i, "")
    .replace(/\s+-\s+/g, " – ")
    .replace(/[.:…]+$/, "")
    .trim();
}

/** Returnables the tender names twice (a table and an index) or several ways: annexure letters, common documents. */
export function returnableKey(name: string) {
  const annexure = /annexure\s+([a-z])\b/i.exec(name)?.[1];
  if (annexure) return `annexure-${annexure.toUpperCase()}`;
  if (/b-?bbee|sworn affidavit/i.test(name)) return "bbbee";
  if (/tax (clearance|compliance|verification)|\btcs\b|tax pin/i.test(name)) return "tax";
  if (/\bcsd\b|central supplier database|maaa/i.test(name)) return "csd";
  if (/company registration|cipc|registration (certificate|document)/i.test(name)) return "registration";
  if (/pric(e|ing) schedule|\bboq\b|bill of quantities/i.test(name)) return "pricing";
  return name.toLowerCase();
}

export function groupRequirements(
  segments: TenderSegment[],
  kinds: { kind: SegmentKind; confidence: number }[],
  minConfidence = 0.5,
): { requirements: DraftRequirement[]; threshold?: number } {
  const requirements: DraftRequirement[] = [];
  let threshold: number | undefined;
  let criterion: DraftRequirement | null = null;
  let inScoredTable = false;
  let tier: ReturnableTier | undefined;
  let tierPrefix: string | undefined;

  const startCriterion = (text: string, page: number, confidence: number) => {
    // A description that came before its heading (table columns read out of order) joins it
    if (criterion && criterion.points === undefined && !criterion.items?.length && !CRITERION_START.test(text)) {
      criterion.text = `${criterion.text} ${tidy(text)}`;
      criterion.points = parsePoints(text);
      return;
    }
    criterion = { kind: "scored", text: tidy(text), points: parsePoints(text), page, confidence };
    requirements.push(criterion);
  };

  const addReturnable = (text: string, page: number, confidence: number, mandatory = false) => {
    const name = returnableName(text);
    if (name.length < 4 || name.length > 90 || FORM_FIELD.test(name) || !DOCUMENT_WORD.test(name)) return;
    const key = returnableKey(name);
    const existing = requirements.find((r) => r.kind === "returnable" && returnableKey(r.text) === key);
    if (existing) {
      // Keep the fuller name and the more specific action (the table says what to do; the index doesn't)
      if (name.length > existing.text.length && !/^annexure\s+[a-z]$/i.test(name)) existing.text = name;
      if (existing.action === "submit") existing.action = actionOf(text);
      existing.tier ??= mandatory ? "mandatory" : tier;
      return;
    }
    requirements.push({
      kind: "returnable",
      text: name,
      action: actionOf(text),
      tier: mandatory ? "mandatory" : tier,
      page,
      confidence,
    });
  };

  segments.forEach((segment, i) => {
    const found = kinds[i] ?? { kind: "other" as SegmentKind, confidence: 0 };
    let kind = found.kind;
    const confidence = found.confidence;
    const text = segment.text;
    const minimum = /minimum (?:score|of)\s*(?:of\s*)?(\d+)\s*(?:points|%)/i.exec(text);
    if (minimum && threshold === undefined) threshold = Number(minimum[1]);
    const tierHeading = TIERS.find(([pattern]) => pattern.test(text));
    if (tierHeading) {
      // The tier covers the items numbered under its heading ("2.2." covers "2.2.1", "2.2.2")
      tier = tierHeading[1];
      tierPrefix = /^(\d+(\.\d+)*)\.?\s/.exec(text)?.[1];
      if (LIST_HEADING.test(text) || text.length < 60) return;
    } else if (tierPrefix && /^\d/.test(text) && !text.startsWith(`${tierPrefix}.`)) {
      tier = undefined;
      tierPrefix = undefined;
    }
    // Inside a scoring table, a numbered heading is a criterion even when it reads like a title
    if (inScoredTable && CRITERION_START.test(text) && kind === "other") kind = "scored";
    if (kind === "other" || confidence < minConfidence) {
      if (CRITERION_START.test(text)) criterion = null;
      return;
    }

    if (kind === "scored") {
      inScoredTable = true;
      // Price and preference points (B-BBEE, specific goals) are calculated, not judged
      if (/b-?bbee|price \(|80\/20|90\/10|specific goals/i.test(text) && !CRITERION_START.test(text)) return;
      if (HEADING.test(text) || CAPS_TITLE.test(text) || /specific goals/i.test(text)) return;
      if (LIST_ITEM.test(text) && criterion) {
        const [item, ...rule] = text.split(/\s(?=Bidders?\s(?:complies|comply|has|have)\b)/i);
        criterion.items = [...(criterion.items ?? []), tidy(item.replace(/^\d\.\s+/, ""))];
        if (rule.length) criterion.scoring = [...(criterion.scoring ?? []), rule.join(" ").trim()];
        return;
      }
      if (SCORING_RULE.test(text) && criterion && !CRITERION_START.test(text)) {
        const rules = criterion.scoring ?? [];
        // A rule broken across lines ("Bidder complies on 4" / "of the listed skills = 2%") is one rule
        if (rules.length && !/=\s*\d/.test(rules[rules.length - 1])) rules[rules.length - 1] += ` ${text}`;
        else rules.push(text);
        criterion.scoring = rules;
        return;
      }
      startCriterion(text, segment.page, confidence);
      return;
    }

    criterion = null;
    inScoredTable = false;
    if (HEADING.test(text) || CAPS_TITLE.test(text) || CONSEQUENCE.test(text) || RESERVATION.test(text)) return;
    if (DECLARATION.test(text)) return;

    if (kind === "returnable") {
      if (LIST_HEADING.test(text) && !DOCUMENT_WORD.test(returnableName(text))) return;
      addReturnable(text, segment.page, confidence);
      return;
    }
    if (kind === "condition") {
      if (!KEY_CONDITION.test(text)) {
        // The details of a condition that came on its own line ("Compulsory Briefing Session" / "19 October…")
        const previous = requirements[requirements.length - 1];
        if (previous?.kind === "condition" && !/\d/.test(previous.text) && /\d/.test(text))
          previous.text += `: ${tidy(text)}`;
        return;
      }
      requirements.push({ kind, text: tidy(text), page: segment.page, confidence });
      return;
    }
    // A mandatory "completed pricing schedule" is a mandatory returnable
    if (/^(\d+(\.\d+)*\.?\s+)?(completed|signed)\s/i.test(text) && DOCUMENT_WORD.test(text)) {
      addReturnable(text.replace(/^(\d+(\.\d+)*\.?\s+)?(completed|signed)\s/i, "$1"), segment.page, confidence, true);
      return;
    }
    if (LIST_HEADING.test(text)) return;
    requirements.push({ kind, text: tidy(text), page: segment.page, confidence });
  });

  for (const r of requirements) {
    if (r.kind !== "scored") continue;
    // Points from the scoring rules when the heading didn't carry them ("= 30%")
    if (r.points === undefined && r.scoring?.length) {
      const awarded = r.scoring.map((s) => parsePoints(s.replace(/.*=/, "")) ?? 0);
      r.points = Math.max(...awarded) || undefined;
    }
    r.scoring = r.scoring?.map((s) => s.replace(/\s+/g, " ").trim());
  }
  // A heading that only grouped sub-criteria ("3 Staffing 25%") isn't scored on its own
  const grouped = requirements.filter(
    (r) => !(r.kind === "scored" && /^\d+\s+\w+(\s\w+)?$/.test(r.text) && !r.items?.length && !r.scoring?.length),
  );
  return { requirements: grouped, threshold };
}

/** Profile documents (DocKey values) that answer a returnable, by its key. The SME doesn't have to send them again. */
export const PROFILE_RETURNABLES: Record<string, string> = {
  bbbee: "bbbeeCertificate",
  tax: "taxCertificate",
  registration: "cipcCertificate",
  csd: "csdReport",
};

/** Points a scoring rule awards: "Bidder complies on 4 of the listed skills = 2%" → 2. */
export function rulePoints(rule: string) {
  const m = /=\s*(\d+(?:[.,]\d+)?)/.exec(rule);
  return m ? Number(m[1].replace(",", ".")) : undefined;
}

/**
 * What a complete tender states, asked of the tender document so the buyer hears what's missing before
 * SMEs rely on it. Each is a yes/no question; a "no" becomes a gap with the wording here.
 */
export const TENDER_CHECKS = {
  closing: {
    question: "Does the document state a closing date (and time) for submissions?",
    gap: "No closing date or time is stated.",
  },
  submission: {
    question: "Does the document say how and where bidders submit (an address, email or portal)?",
    gap: "It doesn’t say how or where to submit.",
  },
  evaluation: {
    question: "Does the document state how bids are evaluated, with the points or weighting for each criterion?",
    gap: "The evaluation criteria or their points aren’t stated.",
  },
  returnables: {
    question: "Does the document list the documents, forms or certificates bidders must return?",
    gap: "There’s no list of returnable documents.",
  },
  scope: {
    question: "Does the document describe the scope of work or the goods and services required?",
    gap: "The scope of work isn’t described.",
  },
  enquiries: {
    question: "Does the document give a contact person or email address for enquiries?",
    gap: "No contact for enquiries is given.",
  },
} as const;

/** Gaps that follow from the register itself, before any question is asked. */
export function registerGaps(
  requirements: { kind: RequirementKind; points?: number; action?: RequirementAction }[],
  threshold?: number,
) {
  const gaps: string[] = [];
  const scored = requirements.filter((r) => r.kind === "scored");
  const total = scored.reduce((sum, r) => sum + (r.points ?? 0), 0);
  if (scored.some((r) => r.points === undefined))
    gaps.push("Some scored criteria don’t say how many points they carry.");
  if (scored.length && total !== 100)
    gaps.push(`The scored criteria add up to ${Math.round(total * 100) / 100} points, not 100. Check the weightings.`);
  if (threshold !== undefined && total && threshold > total)
    gaps.push(`The minimum to proceed (${threshold}) is more than the ${total} points available.`);
  if (scored.length && threshold === undefined)
    gaps.push("No minimum score to proceed is stated for the technical evaluation.");
  if (!requirements.some((r) => r.kind === "returnable")) gaps.push("No returnable documents were found.");
  return gaps;
}

/** A register as the buyer's Requirements tab shows it, with the gaps that follow from the list itself. */
export function registerView<
  R extends {
    status: string;
    gaps: string[];
    threshold?: number;
    requirements: { kind: RequirementKind; points?: number; action?: RequirementAction }[];
  },
>(register: R | undefined) {
  if (!register) return null;
  return {
    ...register,
    gaps: [
      ...register.gaps,
      ...(register.status === "reading" ? [] : registerGaps(register.requirements, register.threshold)),
    ],
  };
}
