import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { HeroPreview } from "@/components/landing/hero-preview";
import { CtaDither } from "@/components/landing/shader-backdrops";
import { Button } from "@/components/ui/button";
import { DOCUMENTS } from "@/lib/sme/documents";

const AUDIENCES = [
  {
    title: "SMEs",
    description: "Build your profile once and get matched to tenders, RFQs and funding in your area.",
    points: ["Register your business", "Keep compliance documents current", "See matched opportunities"],
    available: true,
  },
  {
    title: "Corporates & funders",
    description: "Post opportunities, review AI-ranked shortlists and source verified local suppliers.",
    points: ["Post tenders, RFQs & grants", "Review AI shortlists", "Rate supplier delivery"],
    available: false,
  },
  {
    title: "YES Programme Team",
    description: "Moderate the platform, resolve disputes and track regional insights.",
    points: ["Moderate profiles", "Oversee matching", "Insights dashboards"],
    available: false,
  },
];

const STEPS = [
  {
    title: "Register once",
    body: "Company details, the services you offer, the provinces and areas you deliver in, and your compliance documents. One profile covers every opportunity on the platform.",
  },
  {
    title: "Get match-ready",
    body: "Your readiness score shows exactly what’s holding you back, like an expired B-BBEE certificate, a missing CSD number or a thin capability statement, and how to fix it.",
  },
  {
    title: "Get matched",
    body: "When a tender, RFQ or grant fits your business and your area, it lands on your dashboard and you’re alerted before the deadline.",
  },
];

const FEATURES = [
  {
    title: "Profile readiness score",
    body: "See which gaps are costing you matches, ranked, with a clear fix for each one.",
  },
  {
    title: "Compliance in one place",
    body: "B-BBEE, tax, CIPC, CSD and more, with expiry dates tracked so nothing lapses before a closing date.",
  },
  {
    title: "Local matching",
    body: "Matched by province and municipality, so you only see work you can actually deliver.",
  },
  {
    title: "Alerts your way",
    body: "New matches, deadline reminders and status updates by email, SMS or WhatsApp, in your language.",
  },
  {
    title: "Low-data mode",
    body: "A lighter experience that keeps data costs down on slower connections.",
  },
  {
    title: "Your data, your call",
    body: "POPIA consent up front. You choose who sees your profile and when your contact details are shared.",
  },
];

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Audiences />
      <HowItWorks />
      <Features />
      <TenderPack />
      <FinalCta />
    </>
  );
}

function Hero() {
  return (
    <section>
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 md:px-6 md:pt-24 md:pb-28 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Connecting enterprise tenders with the right SME providers
          </h1>

          <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
            YES Hub matches small and medium businesses to tenders, RFQs and funding they can actually win, based on
            what they do, where they deliver and whether their paperwork is in order.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/auth/sign-up">
                Register your business
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </div>

        <HeroPreview />
      </div>
    </section>
  );
}

function SectionHeading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-pretty text-muted-foreground">{body}</p>}
    </div>
  );
}

function Audiences() {
  return (
    <section id="who-its-for" className="scroll-mt-16 border-t py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          title="Built for both sides of the deal"
          body="Suppliers get found, buyers get shortlists they can trust, and the programme team keeps it fair."
        />

        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {AUDIENCES.map((audience) => (
            <div key={audience.title} className="flex flex-col border-t pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold">{audience.title}</h3>
                {!audience.available && <span className="text-xs text-muted-foreground">Coming soon</span>}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{audience.description}</p>

              <ul className="mt-5 space-y-1.5 text-sm">
                {audience.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>

              {audience.available && (
                <Link
                  href="/auth/sign-up"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
                >
                  Register your business
                  <ArrowRightIcon className="size-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 border-t py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading title="From registration to your first match" />

        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-16 border-t py-20 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 md:px-6 lg:grid-cols-[1fr_2fr]">
        <SectionHeading
          title="Everything an SME needs to compete"
          body="Winning public and corporate work is as much about paperwork and timing as price. YES Hub keeps both in check."
        />

        <dl className="grid gap-x-8 sm:grid-cols-2">
          {FEATURES.map(({ title, body }) => (
            <div key={title} className="border-t py-5">
              <dt className="font-medium">{title}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function TenderPack() {
  return (
    <section className="border-t py-20 md:py-24">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 md:px-6 lg:grid-cols-2">
        <SectionHeading
          title="The documents buyers ask for, always ready"
          body="Upload each document once. YES Hub tracks what’s missing and what’s about to expire, so you’re never caught out a day before a tender closes."
        />

        <ul className="divide-y rounded-xl border bg-card">
          {DOCUMENTS.map((doc) => (
            <li key={doc.key} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
              <span className="font-medium">{doc.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {doc.required ? "Required" : "Recommended"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 pb-20 md:px-6 md:pb-24">
      {/* Solid primary underneath, so the panel reads the same if the shader can't run */}
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-primary text-primary-foreground">
        <CtaDither />
        <div className="relative flex flex-col gap-6 px-6 py-12 md:flex-row md:items-end md:justify-between md:px-12 md:py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Get your business in front of the right buyers
            </h2>
            <p className="mt-4 text-pretty text-primary-foreground/85">
              Register your SME, close the gaps in your profile and start getting matched to opportunities in your area.
            </p>
          </div>
          <Button size="lg" className="shrink-0 bg-white text-primary hover:bg-white/90" asChild>
            <Link href="/auth/sign-up">
              Register your business
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
