"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { Pill } from "@/components/admin/page-header";
import { daysUntil } from "@/components/enterprise/tenders";
import { Button } from "@/components/ui/button";
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
import type { ApplicationStatus, Evaluation, OpportunityKind } from "../../../convex/schema";

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
 * best fit first. Undefined while loading.
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

const STATUS: Record<ApplicationStatus, { label: string; tone: "neutral" | "success" | "danger" | "info" }> = {
  submitted: { label: "Submitted", tone: "neutral" },
  shortlisted: { label: "Shortlisted", tone: "success" },
  declined: { label: "Not successful", tone: "danger" },
  awarded: { label: "Awarded", tone: "info" },
};

export function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  return <Pill tone={STATUS[status].tone}>{STATUS[status].label}</Pill>;
}

export function FitPill({ evaluation }: { evaluation: Evaluation }) {
  return evaluation.qualifies ? (
    <Pill tone="success">You qualify</Pill>
  ) : (
    <Pill tone="danger">You don’t qualify yet</Pill>
  );
}

/** Requirements and strengths, met or not. */
export function ChecksList({ evaluation }: { evaluation: Evaluation }) {
  const groups = [
    { title: "Requirements", checks: evaluation.checks.filter((c) => c.required) },
    { title: "Strengths", checks: evaluation.checks.filter((c) => !c.required) },
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{group.title}</p>
          <ul className="space-y-2">
            {group.checks.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.detail}</span>
                </span>
                <span
                  className={
                    c.passed
                      ? "shrink-0 text-xs font-medium text-success"
                      : "shrink-0 text-xs font-medium text-destructive"
                  }
                >
                  {c.passed ? "Met" : "Not met"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Most documents an SME can send with one application (MAX_ATTACHMENTS in convex/review.ts). */
const MAX_ATTACHMENTS = 5;
const ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg";

type Attachment = { id: number; label: string; file: File | null };

/**
 * Opens the application form: a quote when the buyer scores price, a short proposal and supporting
 * documents. Jev reads them with the compliance documents on the profile and scores the application.
 */
export function ApplyButton({
  opportunityId,
  title,
  qualifies,
  scoresPrice,
  size = "sm",
}: {
  opportunityId: Id<"opportunities">;
  title: string;
  qualifies: boolean;
  scoresPrice: boolean;
  size?: "sm" | "default";
}) {
  const apply = useMutation(api.smeOpportunities.apply);
  const upload = useUploadFile();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [quote, setQuote] = useState("");
  const [proposal, setProposal] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const quoteValue = Number(quote.replace(/[\s,R]/gi, ""));
  const quoteOk = !scoresPrice || (quote.trim() !== "" && quoteValue > 0);
  const attachmentsOk = attachments.every((a) => a.file && a.label.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const uploaded = [];
      for (const a of attachments) {
        const file = await upload(a.file!);
        uploaded.push({ ...file, label: a.label.trim() });
      }
      await apply({
        opportunityId,
        quote: quote.trim() ? quoteValue : undefined,
        proposal: proposal.trim() || undefined,
        attachments: uploaded,
      });
      toast.success(`Applied to ${title}. Your documents are being reviewed.`);
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t send your application."));
    } finally {
      setPending(false);
    }
  };

  const update = (id: number, change: Partial<Attachment>) =>
    setAttachments((list) => list.map((a) => (a.id === id ? { ...a, ...change } : a)));

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size={size}>Apply</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Apply to {title}</DialogTitle>
            <DialogDescription>
              YES Hub reads your compliance documents and anything you attach here, then scores your application against
              the buyer’s criteria. The buyer sees the result and the reasons.
            </DialogDescription>
          </DialogHeader>

          {!qualifies && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              You don’t meet every requirement yet. The buyer will see what’s missing; fixing it first, for example by
              renewing an expired document, gives you a better chance.
            </p>
          )}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="apply-quote">Your price (rand){scoresPrice ? "" : ", optional"}</FieldLabel>
              <Input
                id="apply-quote"
                inputMode="decimal"
                placeholder="e.g. 1 250 000"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                required={scoresPrice}
              />
              <FieldDescription>
                {scoresPrice
                  ? "This buyer scores price, so a quote is required. Lower quotes score more price points."
                  : "Leave empty if the opportunity doesn’t ask for a price."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="apply-proposal">Your proposal</FieldLabel>
              <Textarea
                id="apply-proposal"
                rows={5}
                maxLength={4000}
                placeholder="How you’d do the work: your team and capacity, similar work and references, how you’d supervise it."
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
              />
              <FieldDescription>Functionality is scored from what you write here and attach.</FieldDescription>
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Supporting documents</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                  onClick={() => setAttachments((list) => [...list, { id: Date.now(), label: "", file: null }])}
                >
                  Add document
                </Button>
              </div>
              {attachments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  E.g. a pricing schedule, method statement or returnable forms. PDF, JPG or PNG, up to 10 MB each. Your
                  compliance documents come from your profile.
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

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !quoteOk || !attachmentsOk}>
              {pending && <Spinner />}
              {qualifies ? "Send application" : "Apply anyway"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
