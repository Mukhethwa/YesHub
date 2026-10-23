"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";

import { Pill } from "@/components/admin/page-header";
import { daysUntil, KindTile } from "@/components/enterprise/tenders";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useUploadFile } from "@/hooks/use-upload-file";
import { errorMessage } from "@/lib/errors";
import { getSettings } from "@/lib/sme/settings";
import type { SmeProfile } from "@/lib/sme/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { evaluateApplication, type EvaluableOpportunity } from "../../../convex/lib/evaluation";
import type { Evaluation, OpportunityKind } from "../../../convex/schema";
import type { SmeApplicationStatus } from "../../../convex/smeOpportunities";

export type FeedItem = NonNullable<FunctionReturnType<typeof api.smeOpportunities.feed>>[number];

/* ------------------------------------------------------------------------------------------------------ */
/* Where an opportunity is, relative to the SME                                                           */
/* ------------------------------------------------------------------------------------------------------ */

/** home: in the SME's head office province. provinces: elsewhere it delivers. nationwide: open to all of SA. */
export type Reach = "home" | "provinces" | "nationwide" | "outside";

export function reachOf(opportunity: { provinces: string[] }, sme: SmeProfile): Reach {
  if (opportunity.provinces.length === 0) return "nationwide";
  if (opportunity.provinces.includes(sme.hqProvince)) return "home";
  if (sme.nationwide || opportunity.provinces.some((p) => sme.provinces.includes(p))) return "provinces";
  return "outside";
}

export function reachLabel(reach: Reach, opportunity: { provinces: string[] }, sme: SmeProfile) {
  switch (reach) {
    case "home":
      return `In ${sme.hqProvince}`;
    case "provinces":
      return `In ${opportunity.provinces.filter((p) => sme.nationwide || sme.provinces.includes(p)).join(", ")}`;
    case "nationwide":
      return "Nationwide";
    default:
      return `Outside your area (${opportunity.provinces.join(", ")})`;
  }
}

/* ------------------------------------------------------------------------------------------------------ */
/* The SME's matching preferences (Settings)                                                              */
/* ------------------------------------------------------------------------------------------------------ */

const TYPE_FOR_SETTING: Record<string, OpportunityKind> = {
  Tenders: "tender",
  RFQs: "rfq",
  "Grants & funding": "grant",
};

/** "R250 000 and above" → 250000; "Any value" → 0. */
export function minimumValue(setting: string) {
  const digits = Number(setting.replace(/[^\d]/g, ""));
  if (!digits) return 0;
  return /million/i.test(setting) ? digits * 1_000_000 : digits;
}

/** The kinds of opportunity the SME asked to see in Settings. All kinds when none of these are ticked. */
export function preferredKinds(sme: SmeProfile): OpportunityKind[] {
  const kinds = getSettings(sme)
    .opportunityTypes.map((t) => TYPE_FOR_SETTING[t])
    .filter((k): k is OpportunityKind => !!k);
  return kinds.length > 0 ? kinds : ["tender", "rfq", "grant"];
}

/* ------------------------------------------------------------------------------------------------------ */
/* Matches                                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

export type Match = FeedItem & { evaluation: Evaluation; reach: Reach };

/**
 * Open opportunities that haven't closed, each checked against the SME with the same rules buyers use,
 * best fit first. The check orders matches and drives recommendations; its score is never shown to the SME.
 * Undefined while loading.
 */
export function useMatches(sme: SmeProfile) {
  const feed = useQuery(api.smeOpportunities.feed);
  return useMemo(() => {
    if (!feed) return feed;
    return feed
      .filter((o) => daysUntil(o.closesAt) >= 0)
      .map((o) => ({
        ...o,
        evaluation: evaluateApplication(o as EvaluableOpportunity, sme),
        reach: reachOf(o, sme),
      }))
      .sort(
        (a, b) =>
          Number(b.evaluation.qualifies) - Number(a.evaluation.qualifies) ||
          b.evaluation.score - a.evaluation.score ||
          a.closesAt.localeCompare(b.closesAt),
      );
  }, [feed, sme]);
}

/* ------------------------------------------------------------------------------------------------------ */
/* Shared display pieces                                                                                  */
/* ------------------------------------------------------------------------------------------------------ */

const STATUS: Record<SmeApplicationStatus, { label: string; tone: "neutral" | "info" | "success" }> = {
  in_progress: { label: "In progress", tone: "info" },
  submitted: { label: "Submitted", tone: "neutral" },
  accepted: { label: "Accepted", tone: "success" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

/** The only application status an SME sees: in progress, submitted, withdrawn, or accepted into an ESD programme. */
export function ApplicationStatusPill({ status }: { status: SmeApplicationStatus }) {
  return <Pill tone={STATUS[status].tone}>{STATUS[status].label}</Pill>;
}

/**
 * Whether the SME's profile fits what the listing is for (where the work is, B-BBEE level, its field, good
 * standing). Documents aren't part of it: missing documents are something to fix, so they're recommendations.
 */
export function fitsProfile(evaluation: Evaluation) {
  return evaluation.checks.filter((c) => c.required && c.id !== "documents").every((c) => c.passed);
}

export type Recommendation = { id: string; text: string; action?: { label: string; href: string } };

const DOCUMENTS_ACTION = { label: "Update documents", href: "/sme/documents" };
const PROFILE_ACTION = { label: "Edit profile", href: "/sme/profile" };

/**
 * What would strengthen the SME's application to a listing, from the checks its profile doesn't meet yet.
 * Phrased as advice: the SME is never told it doesn't qualify.
 */
export function recommendationsFor(
  evaluation: Evaluation,
  opportunity: { provinces: string[]; industry: string; services: string[] },
): Recommendation[] {
  const gaps = evaluation.checks.filter((c) => !c.passed);
  const ordered = [...gaps.filter((c) => c.required), ...gaps.filter((c) => !c.required)];
  return ordered.flatMap((check): Recommendation[] => {
    switch (check.id) {
      case "documents":
        return [{ id: check.id, text: `Bring your documents up to date: ${check.detail}.`, action: DOCUMENTS_ACTION }];
      case "bbbee":
        return [
          {
            id: check.id,
            text: `This buyer asks for ${check.label}. A current certificate at that level strengthens your application.`,
            action: { label: "Update B-BBEE certificate", href: "/sme/documents" },
          },
        ];
      case "province":
        return [
          {
            id: check.id,
            text: `The work is in ${opportunity.provinces.join(", ")}. If you can deliver there, add it to the provinces on your profile.`,
            action: PROFILE_ACTION,
          },
        ];
      case "sector":
        return [
          {
            id: check.id,
            text: `The buyer is looking for ${opportunity.industry} work. If you do this kind of work, list those services on your profile.`,
            action: PROFILE_ACTION,
          },
        ];
      case "services":
        // Nothing to add when the listing doesn't name services, as most ESD programmes don't
        if (opportunity.services.length === 0) return [];
        return [
          {
            id: check.id,
            text: "List the services this work needs on your profile, if you offer them.",
            action: PROFILE_ACTION,
          },
        ];
      case "csd":
        return [
          {
            id: check.id,
            text: "Add your Central Supplier Database (CSD) number to your profile. Most buyers check it.",
            action: PROFILE_ACTION,
          },
        ];
      case "pack":
        return [
          {
            id: check.id,
            text: `Complete your document pack (${check.detail}) so buyers have everything they need.`,
            action: DOCUMENTS_ACTION,
          },
        ];
      case "standing":
        return [{ id: check.id, text: "Your profile is suspended. Contact MASLink to restore it before you apply." }];
      default:
        return [];
    }
  });
}

/** Advice for strengthening an application, each with what to do. */
export function RecommendationList({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {recommendations.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{r.text}</span>
          {r.action && (
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link href={r.action.href}>{r.action.label}</Link>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Most documents an SME can send with one application (MAX_ATTACHMENTS in convex/review.ts). */
const MAX_ATTACHMENTS = 5;
const ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg";

type Attachment = { id: number; label: string; file: File | null };

/** What the SME saved on an unfinished application. */
export type SavedApplication = {
  quote: number | null;
  proposal: string | null;
  attachments: { label: string; name: string }[];
};

/**
 * Opens the application form: a quote when the buyer scores price, a short proposal and supporting
 * documents. The SME can send it, or save it and finish later ("In progress"); the buyer only sees it once
 * it's sent.
 */
export function ApplyButton({
  opportunityId,
  title,
  scoresPrice,
  saved = null,
  size = "sm",
  esd = false,
}: {
  opportunityId: Id<"opportunities">;
  title: string;
  scoresPrice: boolean;
  saved?: SavedApplication | null;
  size?: "sm" | "default";
  /** An ESD programme: no price, and the proposal is why the SME is applying. */
  esd?: boolean;
}) {
  const apply = useMutation(api.smeOpportunities.apply);
  const saveDraft = useMutation(api.smeOpportunities.saveDraft);
  const upload = useUploadFile();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"send" | "save" | null>(null);
  const [quote, setQuote] = useState("");
  const [proposal, setProposal] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [removeSaved, setRemoveSaved] = useState<number[]>([]);

  const savedFiles = saved?.attachments ?? [];
  const room = MAX_ATTACHMENTS - (savedFiles.length - removeSaved.length);
  const quoteValue = Number(quote.replace(/[\s,R]/gi, ""));
  const quoteOk = !scoresPrice || (quote.trim() !== "" && quoteValue > 0);
  const quoteValid = quote.trim() === "" || quoteValue > 0;
  const attachmentsOk = attachments.every((a) => a.file && a.label.trim()) && attachments.length <= room;

  // Each time the form opens it starts from what's saved
  const openForm = (next: boolean) => {
    if (pending) return;
    if (next) {
      setQuote(saved?.quote != null ? String(saved.quote) : "");
      setProposal(saved?.proposal ?? "");
      setAttachments([]);
      setRemoveSaved([]);
    }
    setOpen(next);
  };

  const send = async (mode: "send" | "save") => {
    setPending(mode);
    try {
      const uploaded = [];
      for (const a of attachments) {
        const file = await upload(a.file!);
        uploaded.push({ ...file, label: a.label.trim() });
      }
      const args = {
        opportunityId,
        quote: quote.trim() ? quoteValue : undefined,
        proposal: proposal.trim() || undefined,
        attachments: uploaded,
        removeSaved,
      };
      if (mode === "send") {
        await apply(args);
        toast.success(`Application sent for ${title}.`);
      } else {
        await saveDraft(args);
        toast.success("Saved. Finish it any time from Opportunities.");
      }
      setOpen(false);
    } catch (error) {
      toast.error(
        errorMessage(error, mode === "send" ? "Couldn’t send your application." : "Couldn’t save your application."),
      );
    } finally {
      setPending(null);
    }
  };

  const update = (id: number, change: Partial<Attachment>) =>
    setAttachments((list) => list.map((a) => (a.id === id ? { ...a, ...change } : a)));

  return (
    <Dialog open={open} onOpenChange={openForm}>
      <DialogTrigger asChild>
        <Button size={size}>{saved ? "Continue application" : "Apply"}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void send("send");
          }}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>Apply to {title}</DialogTitle>
            <DialogDescription>
              Your compliance documents come from your profile. Not ready yet? Save it and finish later:{" "}
              {esd ? "the programme team" : "the buyer"} only sees your application once you send it.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            {!esd && (
              <Field>
                <FieldLabel htmlFor="apply-quote">Your price (rand){scoresPrice ? "" : ", optional"}</FieldLabel>
                <Input
                  id="apply-quote"
                  inputMode="decimal"
                  placeholder="e.g. 1 250 000"
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                />
                <FieldDescription>
                  {scoresPrice
                    ? "Needed before you send. This buyer evaluates price."
                    : "Leave empty if the opportunity doesn’t ask for a price."}
                </FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="apply-proposal">{esd ? "Why you’re applying" : "Your proposal"}</FieldLabel>
              <Textarea
                id="apply-proposal"
                rows={5}
                maxLength={4000}
                placeholder={
                  esd
                    ? "Where your business is now, what you’d use this for, and what difference it would make."
                    : "How you’d do the work: your team and capacity, similar work and references, how you’d supervise it."
                }
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
              />
              <FieldDescription>
                {esd
                  ? "The programme team reads this when choosing who to accept."
                  : "The buyer reads this to understand how you’d deliver."}
              </FieldDescription>
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Supporting documents</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={attachments.length >= room}
                  onClick={() => setAttachments((list) => [...list, { id: Date.now(), label: "", file: null }])}
                >
                  Add document
                </Button>
              </div>
              {savedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Saved with this application</p>
                  {savedFiles.map((f, i) => (
                    <label key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={removeSaved.includes(i)}
                        onCheckedChange={(checked) =>
                          setRemoveSaved((list) => (checked ? [...list, i] : list.filter((n) => n !== i)))
                        }
                      />
                      <span>
                        Remove {f.label} <span className="text-muted-foreground">({f.name})</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {attachments.length === 0 && savedFiles.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {esd
                    ? "E.g. a business plan, financial statements or quotes."
                    : "E.g. a pricing schedule, method statement or returnable forms."}{" "}
                  PDF, JPG or PNG, up to 10 MB each.
                </p>
              )}
              {attachments.map((a) => (
                <div key={a.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex gap-2">
                    <Input
                      aria-label="What this document is"
                      placeholder="What it is, e.g. Pricing schedule"
                      value={a.label}
                      onChange={(e) => update(a.id, { label: e.target.value })}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                    >
                      Remove
                    </Button>
                  </div>
                  <Input
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    aria-label="File"
                    onChange={(e) => update(a.id, { file: e.target.files?.[0] ?? null })}
                    required
                  />
                </div>
              ))}
            </div>
          </FieldGroup>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" disabled={!!pending} onClick={() => openForm(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!!pending || !quoteValid || !attachmentsOk}
              onClick={() => void send("save")}
            >
              {pending === "save" && <Spinner />}
              Save and finish later
            </Button>
            <Button type="submit" disabled={!!pending || !quoteOk || !attachmentsOk}>
              {pending === "send" && <Spinner />}
              Send application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * An opportunity as a card in a two-column grid: the kind's tile and the reference as its name, the title
 * and buyer, a row of facts, and the actions at the bottom. Cards in a row share a height, so their facts
 * and actions line up.
 */
export function OpportunityCard({
  kind,
  reference,
  title,
  href,
  subtitle,
  status,
  facts,
  note,
  actions,
}: {
  kind: OpportunityKind;
  reference: string;
  title: string;
  href: string;
  subtitle: string;
  status?: ReactNode;
  facts: { label: string; value: ReactNode; note?: string }[];
  /** A line between the facts and the actions, such as a tip. */
  note?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <li className="flex h-full flex-col rounded-xl border bg-card">
      <div className="flex items-start gap-3 p-5 pb-4">
        <KindTile kind={kind} className="mt-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            {/* The reference is how SMEs and buyers refer to a listing, so it's the card's name */}
            <Link href={href} className="font-semibold tracking-tight hover:underline">
              {reference}
            </Link>
            {status && <div className="flex flex-wrap items-center gap-2">{status}</div>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-medium">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-px border-y bg-border">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0 bg-card px-4 py-3 first:pl-5">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="mt-0.5 text-sm font-medium break-words tabular-nums">{fact.value}</dd>
            {fact.note && <dd className="text-xs text-muted-foreground">{fact.note}</dd>}
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-col gap-3 p-5 pt-4">
        {note && <div className="text-sm text-muted-foreground">{note}</div>}
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </li>
  );
}
