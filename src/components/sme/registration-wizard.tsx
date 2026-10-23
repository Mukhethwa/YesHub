"use client";

import { useMutation } from "convex/react";
import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useUploadFile } from "@/hooks/use-upload-file";
import { errorMessage } from "@/lib/errors";
import { EMPTY_DETAILS, pickDetails, type SmeForm, type UpdateForm } from "@/lib/sme/form";
import { type Errors, type StepId, validateStep } from "@/lib/sme/validation";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { CompanySummaryField } from "./company-summary";
import { CompanyStep, ContactStep, CoverageStep, DocumentsStep, OfferingStep, ReviewStep } from "./steps";

const STEPS: { id: StepId; title: string; heading: string; blurb: string; tip: string }[] = [
  {
    id: "company",
    title: "Company details",
    heading: "Tell us about your company",
    blurb: "Use the details exactly as they appear on your CIPC registration.",
    tip: "Buyers verify suppliers against CIPC and the Central Supplier Database. Matching details speed up approval.",
  },
  {
    id: "offering",
    title: "Services & capabilities",
    heading: "What does your business do?",
    blurb: "List your services and describe what you can deliver.",
    tip: "Your capability statement is matched against tender requirements. Be specific.",
  },
  {
    id: "coverage",
    title: "Provinces & service areas",
    heading: "Where can you deliver?",
    blurb: "We only match you to opportunities in the areas you serve.",
    tip: "Many corporates prioritise local suppliers. Naming your municipalities helps you rank higher close to home.",
  },
  {
    id: "documents",
    title: "Compliance documents",
    heading: "Upload your compliance documents",
    blurb: "Most buyers can’t contract without these.",
    tip: "We flag anything that’s expiring before a buyer sees it, and remind you to renew it.",
  },
  {
    id: "contact",
    title: "Primary contact",
    heading: "Who should we contact?",
    blurb: "This person receives opportunity alerts.",
    tip: "Alerts go out by email, SMS and WhatsApp so you never miss a closing date, even on a low-data connection.",
  },
  {
    id: "review",
    title: "Review & submit",
    heading: "Review your profile",
    blurb: "Check everything looks right before you submit.",
    tip: "You control who sees your profile. You can update details or withdraw consent from your dashboard at any time.",
  },
];

export function RegistrationWizard({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const uploadFile = useUploadFile();
  const register = useMutation(api.smes.register);

  const [form, setForm] = useState<SmeForm>({
    ...EMPTY_DETAILS,
    contactName: name,
    email,
    bbbeeCertificate: null,
    taxCertificate: null,
    companyProfile: null,
    consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [index, setIndex] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [submitting, setSubmitting] = useState<"uploading" | "saving" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const update: UpdateForm = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch)) delete next[key as keyof Errors];
      return next;
    });
  };

  const goTo = (i: number) => {
    setIndex(i);
    setErrors({});
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showErrors = (errs: Errors) => {
    setErrors(errs);
    const first = Object.keys(errs)[0];
    requestAnimationFrame(() => document.getElementById(first)?.focus());
  };

  const submit = async () => {
    setSubmitError(null);
    try {
      setSubmitting("uploading");
      const [bbbeeCertificate, taxCertificate, companyProfile] = await Promise.all([
        uploadFile(form.bbbeeCertificate!),
        uploadFile(form.taxCertificate!),
        form.companyProfile ? uploadFile(form.companyProfile) : undefined,
      ]);

      setSubmitting("saving");
      const details = pickDetails(form, Object.keys(EMPTY_DETAILS) as (keyof typeof EMPTY_DETAILS)[]);
      await register({ details, documents: { bbbeeCertificate, taxCertificate, companyProfile } });
      router.push("/sme?welcome=1");
    } catch (error) {
      setSubmitError(errorMessage(error, "We couldn’t create your profile. Please try again."));
      setSubmitting(null);
    }
  };

  const next = () => {
    const errs = validateStep(step.id, form);
    if (Object.keys(errs).length) return showErrors(errs);

    if (!isLast) {
      setFurthest((f) => Math.max(f, index + 1));
      return goTo(index + 1);
    }

    // Earlier steps can be edited after passing them, so re-check everything before submitting
    const broken = STEPS.findIndex((s) => Object.keys(validateStep(s.id, form)).length > 0);
    if (broken !== -1) {
      goTo(broken);
      return requestAnimationFrame(() => showErrors(validateStep(STEPS[broken].id, form)));
    }

    void submit();
  };

  const stepProps = { form, errors, update };

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 pb-10 md:px-6">
      {/* Step navigation */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-20">
          <p className="text-xs font-semibold text-muted-foreground">SME registration</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Step {index + 1} of {STEPS.length}
          </p>

          <nav aria-label="Registration steps" className="mt-4 space-y-0.5">
            {STEPS.map((s, i) => {
              const done = i < furthest && i !== index;
              const reachable = i <= furthest;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!reachable || !!submitting}
                  onClick={() => goTo(i)}
                  aria-current={i === index ? "step" : undefined}
                  className={cn(
                    "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors",
                    i === index
                      ? "bg-accent/15 font-medium"
                      : reachable
                        ? "hover:bg-muted"
                        : "cursor-default text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      done
                        ? "bg-primary text-primary-foreground"
                        : i === index
                          ? "border-2 border-primary text-primary"
                          : "border text-muted-foreground",
                    )}
                  >
                    {done ? <CheckIcon className="size-3.5" /> : i + 1}
                  </span>
                  {s.title}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold">Why we ask</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.tip}</p>
          </div>
        </div>
      </aside>

      {/* Step content */}
      <main className="min-w-0 flex-1">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <Progress
            value={((index + 1) / STEPS.length) * 100}
            aria-label="Registration progress"
            className="h-1 rounded-none lg:hidden"
          />

          <div className="border-b px-5 pt-7 pb-6 md:px-10 md:pt-9">
            <p className="text-xs font-semibold text-muted-foreground">
              Step {index + 1} of {STEPS.length}
              <span className="lg:hidden">, {step.title}</span>
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-[28px]">{step.heading}</h1>
            <p className="mt-1.5 text-muted-foreground">{step.blurb}</p>
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
          >
            <div className="px-5 py-7 md:px-10 md:py-9">
              {step.id === "company" && <CompanyStep {...stepProps} />}
              {step.id === "offering" && (
                <div className="space-y-7">
                  <OfferingStep {...stepProps} />
                  <CompanySummaryField {...stepProps} />
                </div>
              )}
              {step.id === "coverage" && <CoverageStep {...stepProps} />}
              {step.id === "documents" && <DocumentsStep {...stepProps} />}
              {step.id === "contact" && <ContactStep {...stepProps} />}
              {step.id === "review" && (
                <ReviewStep {...stepProps} onEdit={(id) => goTo(STEPS.findIndex((s) => s.id === id))} />
              )}

              {submitError && (
                <div role="alert" className="mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card px-5 py-4 md:px-10">
              {index > 0 ? (
                <Button type="button" variant="ghost" disabled={!!submitting} onClick={() => goTo(index - 1)}>
                  Back
                </Button>
              ) : (
                <Button type="button" variant="ghost" asChild>
                  <Link href="/start">Cancel</Link>
                </Button>
              )}
              <Button type="submit" disabled={!!submitting} className="min-w-36">
                {submitting && <Spinner />}
                {!isLast
                  ? "Continue"
                  : submitting === "uploading"
                    ? "Uploading documents…"
                    : submitting === "saving"
                      ? "Creating profile…"
                      : "Create my profile"}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
