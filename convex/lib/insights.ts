import { DOCUMENTS, expiryFor } from "../../src/lib/sme/documents";
import type { Doc } from "../_generated/dataModel";
import type { DocKey } from "../schema";
import { profileDocumentFor } from "./tender";

/*
 * Insights: the gaps many SMEs share, found in the platform's own data, so MASLink and the buyers it works
 * with can see where support would unlock the most applications. Every insight is a count over real records
 * (profiles, documents, the eligibility checks on applications, and what the review found against tender
 * requirements), with who it affects, what it holds back, and a suggested form of support. Pure: the query
 * passes today's date in, so nothing here reads the clock.
 */

export type InsightCategory = "documents" | "tender" | "eligibility" | "profile" | "demand" | "scoring";

export type Insight = {
  id: string;
  category: InsightCategory;
  title: string;
  /** The finding in one sentence, with its numbers. */
  finding: string;
  affected: number;
  /** What `affected` is out of, and what it counts ("SMEs", "applications"). */
  total: number;
  unit: string;
  /** What the gap holds back. */
  holdsBack: { applications: number; opportunities: number; value: number };
  /** Buyers whose opportunities it holds back, most affected first. */
  buyers: { name: string; applications: number }[];
  /** Where the affected SMEs are concentrated: provinces and industries. */
  segments: { label: string; count: number }[];
  support: string;
  smes: { id: string; name: string; province: string; industry: string; email: string }[];
  /** For ordering: how many it reaches and how much it holds back. */
  weight: number;
};

type Sme = Doc<"smes">;
type Opportunity = Doc<"opportunities">;
type Application = Doc<"applications">;

/** Suggested support for each standard document SMEs lack. */
const DOCUMENT_SUPPORT: Record<DocKey, string> = {
  bbbeeCertificate:
    "Most of these are EMEs or QSEs, which can prove their level with a sworn affidavit instead of an agency. A short affidavit clinic, with the dti template, would unlock them.",
  taxCertificate:
    "Run a SARS eFiling session: registering, getting the Tax Compliance Status PIN and fixing whatever keeps the status non-compliant.",
  cipcCertificate:
    "Help them download their CoR14.3 from the CIPC BizPortal, or register the company if it's still informal.",
  companyProfile:
    "Offer a company profile template and a writing session: who they are, what they've delivered, for whom, and their team.",
  csdReport:
    "Set up a Central Supplier Database help desk: registration, keeping banking and tax details current, and downloading the CSD report.",
  bankLetter:
    "Ask partner banks for a standard confirmation letter process, or show SMEs where to request one in their banking app.",
  coidaLetter:
    "Run a COIDA registration clinic with the Compensation Fund: registering, filing the return of earnings and getting the letter of good standing.",
  proofOfAddress:
    "Accept a lease, municipal account or a letter from the landlord, and show SMEs operating from home how to get one.",
};

/**
 * The same, for a buyer. Buyers don't contact applicants (MASLink alerts and reminds SMEs itself), so these
 * are the levers in the buyer's own process: what its listings ask for, when, and supplier development.
 */
const BUYER_DOCUMENT_SUPPORT: Record<DocKey, string> = {
  bbbeeCertificate:
    "MASLink reminds these SMEs to upload a current certificate. On your side, accept sworn affidavits from EMEs and QSEs, as the B-BBEE codes allow, instead of asking for an agency certificate.",
  taxCertificate:
    "MASLink reminds these SMEs to get their Tax Compliance Status PIN. Asking for the PIN, which you can verify with SARS, is easier to meet than a printed certificate.",
  cipcCertificate:
    "MASLink reminds these SMEs. A CoR14.3 printout from the CIPC BizPortal is enough, so there's no need to ask for certified copies.",
  companyProfile:
    "MASLink prompts these SMEs to add one. If a company profile doesn't count in your evaluation, consider not requiring it.",
  csdReport:
    "MASLink reminds these SMEs to register on the Central Supplier Database. If you only need the CSD number, ask for that instead of the full report.",
  bankLetter:
    "MASLink reminds these SMEs. Consider asking for a bank confirmation letter only from the supplier you appoint, at contracting.",
  coidaLetter:
    "MASLink reminds these SMEs. Consider asking for COIDA only at contracting, or funding a COIDA registration drive through MASLink as supplier development.",
  proofOfAddress:
    "MASLink reminds these SMEs. Accepting a lease, municipal account or a letter from the landlord as proof of address lets more of them qualify.",
};

const ELIGIBILITY: Record<string, { title: string; support: string; buyer: string }> = {
  province: {
    title: "Applying where they don't deliver",
    support:
      "Point these SMEs to work in their own provinces, or help them extend their reach: partnering, subcontracting to a local supplier, or adding provinces they really can serve.",
    buyer:
      "MASLink recommends listings in each SME's own areas and warns them before they apply elsewhere. If you'd consider suppliers from further away, widen the provinces on the listing.",
  },
  bbbee: {
    title: "B-BBEE level below buyers' minimums",
    support:
      "Many could improve their level: EMEs and QSEs with 51% or more black ownership qualify for Level 1 or 2 by affidavit. Enterprise and supplier development spend can also fund verification.",
    buyer:
      "MASLink tells SMEs the level you ask for before they apply. Check whether a minimum level is needed as a gate at all: preference points already reward higher levels.",
  },
  documents: {
    title: "Held back by missing or expired documents",
    support:
      "Send these SMEs a reminder with what's missing and why it matters, and run a document clinic before the next round of closing dates.",
    buyer:
      "MASLink reminds these SMEs of what's missing before your closing dates. Asking for fewer documents at application, and the rest from the supplier you appoint, lets more of them qualify.",
  },
  sector: {
    title: "Applying outside their industry",
    support:
      "Coach these SMEs on choosing opportunities that fit their track record, and show buyers which of them could grow into the work with mentoring.",
    buyer:
      "MASLink matches SMEs to listings in their industry. If you're open to suppliers from related industries, leave the industry open on the listing.",
  },
  services: {
    title: "Not offering the services buyers ask for",
    support:
      "Help SMEs describe their services in the words buyers use, and support the ones close to a fit to add the service.",
    buyer:
      "MASLink matches SMEs on the services they list. Describing the work in plain terms on the listing helps the right SMEs find it.",
  },
};

/** A document's name inside a sentence: "tax compliance status", but "CSD registration report" keeps its capitals. */
const inSentence = (label: string) =>
  /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A returnable's name across tenders: "SBD 4", or the name tidied. */
function formKey(name: string) {
  const sbd = /\bsbd\s*(\d+(\.\d+)?)/i.exec(name);
  return sbd ? `sbd ${sbd[1]}` : norm(name);
}

function topSegments(smes: Sme[]) {
  const counts = new Map<string, number>();
  for (const s of smes) {
    if (s.hqProvince) counts.set(s.hqProvince, (counts.get(s.hqProvince) ?? 0) + 1);
    if (s.industry) counts.set(s.industry, (counts.get(s.industry) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count }));
}

const smeRow = (s: Sme) => ({
  id: s._id,
  name: s.companyName,
  province: s.hqProvince,
  industry: s.industry,
  email: s.email,
});

export function computeInsights({
  smes,
  opportunities,
  applications,
  organizationNames,
  today,
  suppliers,
  audience = "platform",
}: {
  /** Who reads the support: MASLink staff, or a buyer looking at its own applicants. */
  audience?: "platform" | "organisation";
  smes: Sme[];
  /** Who could meet unmet demand. Defaults to `smes`; an organisation's insights pass every visible SME. */
  suppliers?: Sme[];
  opportunities: Opportunity[];
  applications: Application[];
  organizationNames: Map<string, string>;
  /** yyyy-mm-dd, for document expiry and which opportunities are still open. */
  today: string;
}): Insight[] {
  const insights: Insight[] = [];
  const say = (platform: string, buyer: string) => (audience === "organisation" ? buyer : platform);
  const smeById = new Map(smes.map((s) => [s._id as string, s]));
  const opportunityById = new Map(opportunities.map((o) => [o._id as string, o]));
  const open = opportunities.filter((o) => o.status === "open" && o.closesAt >= today);
  const ours = applications.filter((a) => smeById.has(a.smeId));
  const total = smes.length;
  if (total === 0) return [];

  /** Applications by these SMEs, the opportunities they went to, and those opportunities' buyers. */
  const holdsBack = (apps: Application[]) => {
    const opps = new Set(apps.map((a) => a.opportunityId as string));
    const byBuyer = new Map<string, number>();
    for (const a of apps) {
      const name = organizationNames.get(a.organizationId) ?? "A buyer";
      byBuyer.set(name, (byBuyer.get(name) ?? 0) + 1);
    }
    return {
      holdsBack: {
        applications: apps.length,
        opportunities: opps.size,
        value: [...opps].reduce((sum, id) => sum + (opportunityById.get(id)?.value ?? 0), 0),
      },
      buyers: [...byBuyer.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, applications: n })),
    };
  };

  const add = (insight: Omit<Insight, "weight">) => {
    if (insight.affected < 2) return;
    // Reach matters most; what it holds back breaks ties and lifts gaps that block real bids
    const weight = pct(insight.affected, insight.total) + insight.holdsBack.applications * 6;
    insights.push({ ...insight, weight });
  };

  /* Standard documents ---------------------------------------------------------------------------- */
  for (const doc of DOCUMENTS) {
    const lacking = smes.filter((s) => {
      if (!s.documents[doc.key]) return true;
      const expiry = expiryFor(s, doc.key);
      return !!expiry && expiry < today;
    });
    if (pct(lacking.length, total) < 15) continue;
    const expired = lacking.filter((s) => s.documents[doc.key]).length;
    const lackingIds = new Set(lacking.map((s) => s._id as string));
    const asking = (o: Opportunity) =>
      o.requiredDocuments.includes(doc.key) ||
      (o.tender?.status === "confirmed" &&
        o.tender.requirements.some((r) => r.kind === "returnable" && profileDocumentFor(r.text) === doc.key));
    const asked = open.filter(asking).length;
    const blocked = ours.filter((a) => {
      const o = opportunityById.get(a.opportunityId);
      return lackingIds.has(a.smeId) && a.status === "submitted" && !!o && asking(o);
    });
    add({
      id: `document-${doc.key}`,
      category: "documents",
      title: `No current ${inSentence(doc.label)}`,
      finding: `${lacking.length} of ${total} SMEs (${pct(lacking.length, total)}%) don't have a current ${inSentence(doc.label)}${
        expired ? `, ${expired} of them because theirs has expired` : ""
      }.${asked ? ` ${asked} open opportunit${asked === 1 ? "y asks" : "ies ask"} for it.` : ""}`,
      affected: lacking.length,
      total,
      unit: "SMEs",
      ...holdsBack(blocked),
      segments: topSegments(lacking),
      support: say(DOCUMENT_SUPPORT[doc.key], BUYER_DOCUMENT_SUPPORT[doc.key]),
      smes: lacking.map(smeRow),
    });
  }

  /* What the review found against tender requirements ------------------------------------------------- */
  type Group = { name: string; missing: Application[]; partial: Application[]; checked: number };
  const forms = new Map<string, Group>();
  const mandatory = new Map<string, Group>();
  const scored = new Map<
    string,
    { name: string; share: number[]; apps: Application[]; lacking: Map<string, number> }
  >();
  for (const a of ours) {
    const o = opportunityById.get(a.opportunityId);
    const results = a.evaluation.requirements;
    if (!o?.tender || o.tender.status !== "confirmed" || !results) continue;
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const r of o.tender.requirements) {
      const result = byId.get(r.id);
      if (!result) continue;
      if (r.kind === "returnable" && !profileDocumentFor(r.text)) {
        const key = formKey(r.text);
        const g = forms.get(key) ?? { name: r.text, missing: [], partial: [], checked: 0 };
        g.checked++;
        if (result.status === "missing") g.missing.push(a);
        if (result.status === "partial") g.partial.push(a);
        forms.set(key, g);
      } else if (r.kind === "mandatory") {
        const key = norm(r.text);
        const g = mandatory.get(key) ?? { name: r.text, missing: [], partial: [], checked: 0 };
        g.checked++;
        if (result.status !== "met") g.missing.push(a);
        mandatory.set(key, g);
      } else if (r.kind === "scored" && r.points) {
        const key = norm(r.text);
        const g = scored.get(key) ?? {
          name: r.text,
          share: [] as number[],
          apps: [] as Application[],
          lacking: new Map<string, number>(),
        };
        g.share.push((result.points ?? 0) / r.points);
        g.apps.push(a);
        for (const item of r.items ?? []) {
          if (!result.has.some((h) => h.includes(item))) g.lacking.set(item, (g.lacking.get(item) ?? 0) + 1);
        }
        scored.set(key, g);
      }
    }
  }
  const smesOf = (apps: Application[]) =>
    [...new Set(apps.map((a) => a.smeId as string))].flatMap((id) => smeById.get(id) ?? []);
  for (const [key, g] of forms) {
    const short = [...g.missing, ...g.partial];
    if (!short.length) continue;
    const affected = smesOf(short);
    add({
      id: `form-${key}`,
      category: "tender",
      title: `${g.name}: missing or incomplete`,
      finding: `In ${short.length} of ${g.checked} applications to tenders that ask for it, ${g.name} was ${
        g.partial.length
          ? `missing (${g.missing.length}) or sent incomplete or unsigned (${g.partial.length})`
          : "missing"
      }.`,
      affected: short.length,
      total: g.checked,
      unit: "applications",
      ...holdsBack(short),
      segments: topSegments(affected),
      support: say(
        "Run a bid-pack clinic on the tender's own forms: where to find them in the tender documents, filling in every field, and signing and dating them. A filled-in example of each helps most.",
        "MASLink tells each applicant which forms are missing or unsigned. On your side, release the forms as separate fillable files, mark which are mandatory, and walk through them at the briefing session.",
      ),
      smes: affected.map(smeRow),
    });
  }
  for (const [key, g] of mandatory) {
    if (g.missing.length < 2) continue;
    const affected = smesOf(g.missing);
    add({
      id: `mandatory-${key}`,
      category: "tender",
      title: `Can't show: ${g.name}`,
      finding: `${g.missing.length} of ${g.checked} applicants didn't show they meet this mandatory requirement, so they can't qualify.`,
      affected: g.missing.length,
      total: g.checked,
      unit: "applications",
      ...holdsBack(g.missing),
      segments: topSegments(affected),
      support: say(
        "Check whether these SMEs meet the requirement but didn't prove it (a certificate or letter they could attach), or whether it's a real gap a supplier development programme could close.",
        "MASLink tells these applicants what they couldn't show. Check that the requirement is essential to the work and stated clearly in the tender. If it keeps blocking capable SMEs, a supplier development programme through MASLink could close it.",
      ),
      smes: affected.map(smeRow),
    });
  }
  for (const [key, g] of scored) {
    const average = g.share.reduce((s, n) => s + n, 0) / g.share.length;
    if (g.apps.length < 2 || average >= 0.5) continue;
    const affected = smesOf(g.apps);
    const commonGaps = [...g.lacking.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([item]) => item);
    add({
      id: `scored-${key}`,
      category: "scoring",
      title: `Low scores on: ${g.name}`,
      finding: `Applicants score ${Math.round(average * 100)}% of the points on this criterion on average, across ${g.apps.length} applications.${
        commonGaps.length ? ` Most often missing: ${commonGaps.join("; ")}.` : ""
      }`,
      affected: g.apps.length,
      total: g.apps.length,
      unit: "applications",
      ...holdsBack(g.apps),
      segments: topSegments(affected),
      support: say(
        "Mentor these SMEs on evidence: method statements, CVs of key people, contactable references and examples of similar work. It's usually there but not shown.",
        "MASLink shows applicants how to strengthen their evidence. If capable SMEs keep scoring low here, check that the criterion asks for evidence a small business can give, such as references rather than audited turnover.",
      ),
      smes: affected.map(smeRow),
    });
  }

  /* Eligibility checks applications fail ------------------------------------------------------------- */
  const failing = new Map<string, Application[]>();
  for (const a of ours) {
    for (const c of a.evaluation.checks) {
      if (!c.required || c.passed || c.id.startsWith("tender-") || c.id.startsWith("criterion-")) continue;
      failing.set(c.id, [...(failing.get(c.id) ?? []), a]);
    }
  }
  for (const [id, apps] of failing) {
    const meta = ELIGIBILITY[id];
    if (!meta) continue;
    const affected = smesOf(apps);
    add({
      id: `eligibility-${id}`,
      category: "eligibility",
      title: say(meta.title, meta.title.replace("buyers' minimums", "your minimum")),
      finding: `${apps.length} of ${ours.length} applications (${pct(apps.length, ours.length)}%) fail this check, from ${affected.length} SMEs.`,
      affected: apps.length,
      total: ours.length,
      unit: "applications",
      ...holdsBack(apps),
      segments: topSegments(affected),
      support: say(meta.support, meta.buyer),
      smes: affected.map(smeRow),
    });
  }

  /* Profiles buyers find hard to trust --------------------------------------------------------------- */
  const profileGaps: { id: string; title: string; test: (s: Sme) => boolean; support: string; buyer?: string }[] = [
    {
      id: "accreditations",
      title: "No accreditations or certifications listed",
      test: (s) => s.accreditations.length === 0,
      support:
        "Find out which certifications these SMEs' industries expect (ISO, PSIRA, CIDB, food safety) and fund the cheapest route to them through enterprise and supplier development.",
      buyer:
        "MASLink prompts SMEs to list their certifications. Name the ones your work needs on the listing, or fund them as supplier development through MASLink.",
    },
    {
      id: "summary",
      title: "No company summary",
      test: (s) => !s.companySummary?.trim(),
      support:
        "Remind them that the summary is the first thing a buyer reads, and that MASLink can help them write it.",
    },
    {
      id: "capabilities",
      title: "Capabilities described in a sentence or less",
      test: (s) => s.capabilities.trim().length < 120,
      support:
        "A short workshop on describing capacity: team size, equipment, past clients and the largest contract delivered. Buyers score on this.",
      buyer:
        "MASLink prompts these SMEs to describe their capacity. Your evaluation criteria tell them what to describe, so be specific there about the capacity the work needs.",
    },
    {
      id: "csd",
      title: "Not registered on the Central Supplier Database",
      test: (s) => !s.csdNumber.trim(),
      support: "Government and many corporate buyers can't pay a supplier without a CSD number. Help them register.",
      buyer:
        "MASLink reminds these SMEs to register on the Central Supplier Database. If you only need it to pay a supplier, ask for it from the supplier you appoint.",
    },
    {
      id: "verified",
      title: "Not yet verified by MASLink",
      test: (s) => !s.verifiedAt,
      support: "Verify these profiles: buyers shortlist verified SMEs with more confidence.",
    },
  ];
  for (const gap of profileGaps) {
    // A buyer only sees the gaps it has a lever on; the rest are MASLink's to handle with the SME
    if (audience === "organisation" && !gap.buyer) continue;
    const lacking = smes.filter(gap.test);
    if (pct(lacking.length, total) < 20) continue;
    add({
      id: `profile-${gap.id}`,
      category: "profile",
      title: gap.title,
      finding: `${lacking.length} of ${total} SMEs (${pct(lacking.length, total)}%).`,
      affected: lacking.length,
      total,
      unit: "SMEs",
      // How a profile reads doesn't stop an application qualifying, so these hold nothing back
      holdsBack: { applications: 0, opportunities: 0, value: 0 },
      buyers: [],
      segments: topSegments(lacking),
      support: say(gap.support, gap.buyer ?? gap.support),
      smes: lacking.map(smeRow),
    });
  }

  /* Demand that few SMEs can meet ---------------------------------------------------------------------- */
  const offers = (s: Sme, service: string) =>
    s.services.some((x) => norm(x).includes(norm(service)) || norm(service).includes(norm(x)));
  const services = new Map<string, Opportunity[]>();
  for (const o of open)
    for (const service of o.services) services.set(norm(service), [...(services.get(norm(service)) ?? []), o]);
  for (const [key, opps] of services) {
    const name = opps[0].services.find((s) => norm(s) === key) ?? key;
    const offering = (suppliers ?? smes).filter((s) => offers(s, name));
    if (offering.length > 2) continue;
    const value = opps.reduce((sum, o) => sum + (o.value ?? 0), 0);
    insights.push({
      id: `demand-${key}`,
      category: "demand",
      title: `Few SMEs offer ${name.toLowerCase()}`,
      finding: `${opps.length} open opportunit${opps.length === 1 ? "y asks" : "ies ask"} for ${name.toLowerCase()}${
        value
          ? ` (worth ${new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", notation: "compact" }).format(value)})`
          : ""
      }, and ${offering.length === 0 ? "no SME" : offering.length === 1 ? "only 1 SME" : `only ${offering.length} SMEs`} on MASLink offer${offering.length === 1 ? "s" : ""} it.`,
      affected: opps.length,
      total: open.length,
      unit: "open opportunities",
      holdsBack: { applications: 0, opportunities: opps.length, value },
      buyers: [...new Set(opps.map((o) => organizationNames.get(o.organizationId) ?? "A buyer"))].map((n) => ({
        name: n,
        applications: 0,
      })),
      segments: [...new Set(opps.flatMap((o) => (o.provinces.length ? o.provinces : ["Nationwide"])))]
        .slice(0, 4)
        .map((label) => ({
          label,
          count: opps.filter((o) => (o.provinces.length ? o.provinces : ["Nationwide"]).includes(label)).length,
        })),
      support: say(
        "Recruit SMEs that offer it, or help adjacent SMEs add it through training or accreditation. The buyers here may fund it as supplier development.",
        "MASLink looks for more SMEs offering this. You could fund supplier development in it through MASLink, or split large listings so smaller suppliers can bid for part of the work.",
      ),
      smes: offering.map(smeRow),
      weight: 40 + opps.length * 10,
    });
  }

  return insights.sort((a, b) => b.weight - a.weight);
}
