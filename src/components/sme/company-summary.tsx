"use client";

import { SparklesIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { COMPANY_SUMMARY_MAX } from "@/lib/sme/validation";
import type { CompanySummaryRequest, CompanySummaryResult } from "@/app/api/company-summary/route";
import { FormField } from "./controls";
import type { StepProps } from "./steps";

/**
 * The SME's Professional Company Summary: their own words, which AI can rewrite for procurement teams using
 * the profile details already entered. Optional, and separate from the structured profile fields.
 */
export function CompanySummaryField({ form, errors, update }: StepProps) {
  const summary = form.companySummary ?? "";
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CompanySummaryResult | null>(null);
  const ownWords = useRef<HTMLTextAreaElement>(null);

  const hasContext = !!form.companyName.trim() || form.services.length > 0;
  const canImprove = !!summary.trim() || hasContext;

  const improve = async () => {
    setImproving(true);
    setError(null);
    const body: CompanySummaryRequest = {
      draft: summary,
      profile: {
        companyName: form.companyName,
        industry: form.industry,
        yearsTrading: form.yearsTrading,
        employees: form.employees,
        city: form.city,
        hqProvince: form.hqProvince,
        services: form.services,
        capabilities: form.capabilities,
        accreditations: form.accreditations,
        nationwide: form.nationwide,
        provinces: form.provinces,
        serviceAreas: form.serviceAreas,
        bbbeeLevel: form.bbbeeLevel,
      },
    };
    try {
      const res = await fetch("/api/company-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as (CompanySummaryResult & { error?: string }) | null;
      if (!res.ok || !data?.summary) {
        throw new Error(data?.error ?? "Something went wrong while improving your summary. Please try again.");
      }
      setSuggestion({ summary: data.summary, missingInformation: data.missingInformation ?? [] });
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "We couldn’t reach MASLink. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong while improving your summary. Please try again.",
      );
    } finally {
      setImproving(false);
    }
  };

  const applySuggestion = (thenEdit: boolean) => {
    if (!suggestion) return;
    update({ companySummary: suggestion.summary.trim() });
    setSuggestion(null);
    if (thenEdit) {
      requestAnimationFrame(() => {
        const el = ownWords.current;
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
      });
    }
  };

  return (
    <section aria-labelledby="company-summary-heading" className="space-y-4 border-t pt-7">
      <div className="space-y-1">
        <h2 id="company-summary-heading" className="text-base font-semibold">
          Professional company summary
        </h2>
        <p className="text-sm text-muted-foreground">
          The introduction procurement teams read first: who you are, what you deliver and why you’re a good fit. Write
          it in your own words, then let AI turn it into a professional summary. It uses the company details and
          services you’ve already entered, so you don’t need to repeat them.
        </p>
      </div>

      <FormField
        label="Your summary"
        htmlFor="companySummary"
        optional
        error={errors.companySummary}
        hint={
          <span className="flex justify-between gap-4">
            <span>
              Mention your experience, projects or clients you’re happy to name. Facts help more than adjectives.
            </span>
            <span className="shrink-0 tabular-nums">
              {summary.trim().length}/{COMPANY_SUMMARY_MAX}
            </span>
          </span>
        }
      >
        <Textarea
          ref={ownWords}
          id="companySummary"
          rows={5}
          value={summary}
          onChange={(e) => update({ companySummary: e.target.value })}
          placeholder="e.g. We’re a family-owned cleaning company in Durban. We clean offices and clinics for about 12 clients and have our own equipment and vehicles…"
          aria-invalid={!!errors.companySummary || undefined}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={improving || !canImprove} onClick={improve}>
          {improving ? <Spinner /> : <SparklesIcon />}
          {improving ? "Improving your summary…" : "Improve my summary"}
        </Button>
        {!canImprove && (
          <p className="text-xs text-muted-foreground">
            Write a few lines, or add your company name and services first.
          </p>
        )}
      </div>

      {improving && (
        <p role="status" className="text-sm text-muted-foreground">
          Writing a professional summary from your details. This takes a few seconds.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={improve} disabled={improving}>
            Try again
          </Button>
        </div>
      )}

      {suggestion && (
        <div className="space-y-4 rounded-lg border p-4 md:p-5">
          <FormField
            label="Improved summary"
            htmlFor="companySummaryImproved"
            hint="Check every fact is right and edit anything before you use it. Nothing changes until you choose."
          >
            <Textarea
              id="companySummaryImproved"
              rows={8}
              value={suggestion.summary}
              onChange={(e) => setSuggestion({ ...suggestion, summary: e.target.value })}
            />
          </FormField>

          {suggestion.missingInformation.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Worth adding to make it stronger</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {suggestion.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!suggestion.summary.trim()} onClick={() => applySuggestion(false)}>
              Use improved version
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!suggestion.summary.trim()}
              onClick={() => applySuggestion(true)}
            >
              Use it and edit further
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSuggestion(null)}>
              Keep my original
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
