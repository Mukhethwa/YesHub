/* The landing page, section by section, so the page and the marketing video scenes share them. */

import {
  ArrowRightIcon,
  BadgeCheckIcon,
  Building2Icon,
  CalculatorIcon,
  CircleCheckIcon,
  FileCheck2Icon,
  LandmarkIcon,
  LockKeyholeIcon,
  type LucideIcon,
  MapPinnedIcon,
  ScaleIcon,
  ScrollTextIcon,
  StoreIcon,
} from "lucide-react";
import Link from "next/link";

import { KindTile } from "@/components/enterprise/tenders";
import { type Coverage as CoverageData, CoverageMap } from "@/components/landing/coverage-map";
import { OpportunityPreview, RecordPreview, ShortlistPreview, SmePreview } from "@/components/landing/previews";
import { Part } from "@/components/scene-parts";
import { CtaDither } from "@/components/landing/shader-backdrops";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { DOCUMENTS } from "@/lib/sme/documents";
import { cn } from "@/lib/utils";

export const KINDS = [
  {
    kind: "tender",
    title: "Tenders",
    body: "Formal, scored procurement with functionality gates, price and B-BBEE points.",
  },
  {
    kind: "rfq",
    title: "Requests for quotation",
    body: "Quicker buys judged mainly on price, from suppliers who already meet the requirements.",
  },
  {
    kind: "grant",
    title: "Grants and funding",
    body: "Enterprise and supplier development funds, assessed against the funder’s own criteria.",
  },
] as const;

export const SME_POINTS = [
  "One profile for every opportunity: services, provinces, capabilities and compliance",
  "A readiness score that names what’s holding you back and how to fix it",
  "Matches by what you do and where you deliver, before the closing date",
  "The outcome of every application, with the buyer’s reason",
];

export const BUYER_POINTS = [
  "Post tenders, RFQs and grants with your own criteria and required documents",
  "Applicants checked against your requirements and ranked by points",
  "A shortlist of the strongest, with a reason for everyone left off",
  "Your team decides, and every decision is recorded with who made it and why",
];

export const STEPS = [
  {
    title: "Post",
    body: "A buyer publishes an opportunity: scope, provinces, required documents, minimum B-BBEE level and how it will be scored.",
    tone: "bg-brand-blue text-white",
  },
  {
    title: "Match",
    body: "Registered SMEs whose services and coverage fit are told about it. They apply with their profile, a quote and a short proposal.",
    tone: "bg-brand-green text-brand-navy",
  },
  {
    title: "Evaluate",
    body: "Every application is read and scored the same way: requirements first, then functionality, price and preference points.",
    tone: "bg-brand-yellow text-brand-navy",
  },
  {
    title: "Decide",
    body: "The buyer gets a shortlist with reasons, makes the decision, and gives a reason for it. The SME sees the outcome.",
    tone: "bg-brand-red text-white",
  },
];

export const LAWS: { icon: LucideIcon; title: string; act: string; body: string }[] = [
  {
    icon: LandmarkIcon,
    title: "Fair, equitable and transparent",
    act: "Constitution, section 217",
    body: "Every applicant to an opportunity is held to the same published criteria, and the ranking can be traced back to them.",
  },
  {
    icon: CalculatorIcon,
    title: "Preference points by the formula",
    act: "PPPFA and the 2022 regulations",
    body: "Price points use the 80/20 or 90/10 formula and B-BBEE points come from the tables. They are calculated, never judged.",
  },
  {
    icon: ScaleIcon,
    title: "Reasons for every decision",
    act: "PAJA, section 5",
    body: "Shortlisted, declined or awarded, each decision carries a written reason, and the SME can see it.",
  },
  {
    icon: LockKeyholeIcon,
    title: "Personal information protected",
    act: "POPIA",
    body: "Contact and registration details are encrypted at rest, and an SME’s contact details reach a buyer only after shortlisting.",
  },
];

export function Hero() {
  return (
    <section className="scene-unclip relative isolate overflow-hidden bg-brand-navy text-white">
      <LogoMark
        title=""
        className="scene-hide pointer-events-none absolute -right-24 -bottom-16 -z-10 h-auto w-[36rem] -rotate-12 opacity-[0.07]"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 md:px-6 md:pt-24 md:pb-24 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Part id="hero-badge">
            <p className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium">
              <span className="flex gap-0.5" aria-hidden>
                <span className="h-3 w-1 rounded-sm bg-brand-yellow" />
                <span className="h-3 w-1 rounded-sm bg-brand-green" />
                <span className="h-3 w-1 rounded-sm bg-brand-red" />
                <span className="h-3 w-1 rounded-sm bg-brand-blue" />
              </span>
              Procurement between enterprises and South African SMEs
            </p>
          </Part>
          <Part id="hero-title">
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
              Tenders matched to the SMEs that can deliver them
            </h1>
          </Part>
          <Part id="hero-body">
            <p className="mt-5 max-w-xl text-lg text-pretty text-white/75">
              Enterprises and funders post opportunities. MASLink matches them to registered SMEs, scores every
              application against the buyer’s criteria, and keeps a reasoned record of each decision.
            </p>
          </Part>

          <Part id="hero-actions" className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="bg-brand-green text-brand-navy hover:bg-brand-green/90" asChild>
              <Link href="/auth/sign-up">
                Register your business
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              asChild
            >
              <Link href="/auth/sign-up">Post an opportunity</Link>
            </Button>
          </Part>

          <Part id="hero-figures">
            <ul className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/15 pt-6 text-sm">
              {[
                { value: "9", label: "provinces matched" },
                { value: "80/20", label: "and 90/10 price points" },
                { value: "100%", label: "of decisions with a reason" },
              ].map((item) => (
                <li key={item.label}>
                  <p className="text-2xl font-semibold tracking-tight">{item.value}</p>
                  <p className="mt-0.5 text-white/65">{item.label}</p>
                </li>
              ))}
            </ul>
          </Part>
        </div>

        <ShortlistPreview className="shadow-2xl shadow-black/30" />
      </div>
      <div aria-hidden className="grid h-1.5 grid-cols-4">
        <span className="bg-brand-yellow" />
        <span className="bg-brand-green" />
        <span className="bg-brand-red" />
        <span className="bg-brand-blue" />
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-pretty text-muted-foreground">{body}</p>}
    </div>
  );
}

export function Kinds() {
  return (
    <section className="border-b py-12">
      <ul className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-3 md:px-6">
        {KINDS.map((k) => (
          <li key={k.kind} className="flex items-start gap-3">
            <KindTile kind={k.kind} className="size-10 [&_svg]:size-5" />
            <div>
              <h3 className="font-semibold">{k.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{k.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Audience({
  id,
  icon: Icon,
  tone,
  eyebrow,
  title,
  points,
  cta,
  preview,
  reverse = false,
}: {
  id: string;
  icon: LucideIcon;
  tone: string;
  eyebrow: string;
  title: string;
  points: string[];
  cta: string;
  preview: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div id={id} className="grid scroll-mt-20 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn(reverse && "lg:order-2")}>
        <Part id="aud-heading">
          <span className={cn("grid size-10 place-items-center rounded-md", tone)}>
            <Icon className="size-5" />
          </span>
          <p className="mt-5 text-sm font-medium text-muted-foreground">{eyebrow}</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h3>
        </Part>
        <ul className="mt-6 space-y-3">
          {points.map((point, i) => (
            <li key={point}>
              <Part id={"point-" + i} className="flex gap-3 text-sm">
                <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                {point}
              </Part>
            </li>
          ))}
        </ul>
        <Part id="aud-cta" className="mt-8">
          <Button asChild>
            <Link href="/auth/sign-up">
              {cta}
              <ArrowRightIcon />
            </Link>
          </Button>
        </Part>
      </div>
      <div className={cn(reverse && "lg:order-1")}>
        <Part id="aud-preview" className="rounded-xl bg-muted/60 p-4 sm:p-8">
          {preview}
        </Part>
      </div>
    </div>
  );
}

export function Audiences() {
  return (
    <section id="who-its-for" className="scroll-mt-16 py-20 md:py-28">
      <div className="mx-auto max-w-6xl space-y-24 px-4 md:px-6">
        <Audience
          id="for-smes"
          icon={StoreIcon}
          tone="bg-brand-green text-brand-navy"
          eyebrow="For SMEs"
          title="Be ready before the tender closes"
          points={SME_POINTS}
          cta="Register your business"
          preview={<SmePreview />}
        />
        <Audience
          id="for-buyers"
          icon={Building2Icon}
          tone="bg-brand-blue text-white"
          eyebrow="For enterprises and funders"
          title="A shortlist you can defend"
          points={BUYER_POINTS}
          cta="Set up your organisation"
          preview={<OpportunityPreview />}
          reverse
        />
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 border-t bg-muted/40 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading eyebrow="How it works" title="From posting to award, in four steps" />
        <ol className="relative mt-14 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          <span aria-hidden className="absolute top-5 right-[12%] left-[12%] hidden h-px bg-border md:block" />
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative">
              <Step step={step} number={i + 1} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** One step of how it works: its number in a logo colour, a title and what happens. */
export function Step({ step, number }: { step: (typeof STEPS)[number]; number: number }) {
  return (
    <>
      <span
        className={cn(
          "relative grid size-10 place-items-center rounded-full text-sm font-semibold tabular-nums ring-8 ring-muted/40",
          step.tone,
        )}
      >
        {number}
      </span>
      <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
    </>
  );
}

export function Fairness() {
  return (
    <section
      id="fairness"
      className="scene-unclip relative isolate scroll-mt-16 overflow-hidden bg-brand-navy py-20 text-white md:py-28"
    >
      <ScrollTextIcon
        aria-hidden
        strokeWidth={1}
        className="scene-hide pointer-events-none absolute -top-10 -left-16 -z-10 size-96 rotate-12 text-white/[0.04]"
      />
      <div className="mx-auto max-w-6xl space-y-16 px-4 md:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <Part id="fair-heading">
            <p className="text-sm font-medium text-brand-green">The fairness layer</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Built around South Africa’s procurement law
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-white/70">
              Every application is evaluated the same way and every decision is written down, so a buyer can explain an
              award and an SME can understand a decline.
            </p>
          </Part>
          <div className="space-y-3">
            <Part id="record-label">
              <p className="text-sm text-white/70">The record behind one award</p>
            </Part>
            <RecordPreview />
          </div>
        </div>
        <Part id="laws">
          <dl className="scene-unclip grid gap-px overflow-hidden rounded-lg bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {LAWS.map((law, i) => (
              <Part key={law.title} id={"law-" + i} className="h-full bg-brand-navy p-6">
                <dt>
                  <law.icon className="size-5 text-brand-yellow" />
                  <p className="mt-4 font-semibold">{law.title}</p>
                  <p className="mt-0.5 text-xs text-white/55">{law.act}</p>
                </dt>
                <dd className="mt-3 text-sm text-white/75">{law.body}</dd>
              </Part>
            ))}
          </dl>
        </Part>
      </div>
    </section>
  );
}

export function Coverage({ initial }: { initial?: CoverageData }) {
  return (
    <section id="coverage" className="scroll-mt-16 py-20 md:py-28">
      <div className="mx-auto max-w-6xl space-y-10 px-4 md:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <Part id="cov-heading">
            <SectionHeading
              eyebrow="Across South Africa"
              title="Local suppliers, in every province"
              body="Opportunities name the provinces where the work is, and SMEs say where they deliver. Matching starts there."
            />
          </Part>
          <Part id="cov-live">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinnedIcon className="size-4" />
              Live from MASLink
            </p>
          </Part>
        </div>
        <CoverageMap initial={initial} />
      </div>
    </section>
  );
}

export function TenderPack() {
  return (
    <section className="border-t py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 md:px-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            eyebrow="Compliance"
            title="The documents buyers ask for, always ready"
            body="Upload each document once. MASLink tracks what’s missing and what’s about to expire, and every application uses the current version."
          />
          <div className="mt-8 flex flex-wrap gap-6 text-sm">
            <span className="inline-flex items-center gap-2">
              <FileCheck2Icon className="size-4 text-primary" />
              Expiry dates tracked
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheckIcon className="size-4 text-primary" />
              Profiles verified by MASLink
            </span>
          </div>
        </div>

        <ul className="divide-y rounded-lg border bg-card">
          {DOCUMENTS.map((doc) => (
            <li key={doc.key} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
              <span className="flex items-center gap-3 font-medium">
                <FileCheck2Icon className="size-4 text-muted-foreground" />
                {doc.label}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs",
                  doc.required ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {doc.required ? "Required" : "Recommended"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="px-4 pb-20 md:px-6 md:pb-28">
      {/* Solid primary underneath, so the panel reads the same if the shader can't run */}
      <Part id="cta-panel">
        <div className="scene-unclip relative isolate mx-auto max-w-6xl overflow-hidden rounded-xl bg-primary text-primary-foreground">
          <CtaDither className="scene-hide" />
          <LogoMark
            title=""
            className="scene-hide pointer-events-none absolute -right-10 -bottom-10 h-auto w-80 -rotate-12 opacity-15"
          />
          <div className="relative grid gap-8 px-6 py-12 md:grid-cols-[1fr_auto] md:items-end md:px-12 md:py-16">
            <Part id="cta-copy" className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Get your business in front of the right buyers
              </h2>
              <p className="mt-4 text-pretty text-primary-foreground/85">
                Register your SME, close the gaps in your profile and start getting matched. Buyers can set up an
                organisation and post their first opportunity the same day.
              </p>
            </Part>
            <Part id="cta-actions" className="flex flex-wrap gap-3">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90" asChild>
                <Link href="/auth/sign-up">
                  Register your business
                  <ArrowRightIcon />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <Link href="/auth/sign-up">Post an opportunity</Link>
              </Button>
            </Part>
          </div>
        </div>
      </Part>
    </section>
  );
}
