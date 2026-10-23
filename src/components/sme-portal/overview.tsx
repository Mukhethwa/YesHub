"use client";

import { useQuery } from "convex/react";
import {
  CheckIcon,
  CircleAlertIcon,
  FileTextIcon,
  FolderOpenIcon,
  GaugeIcon,
  SendIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { CheckSegments } from "@/components/app/score";
import { isFinished, phaseOf } from "@/components/enterprise/tenders";
import { Section } from "@/components/app/section";
import { StatStrip } from "@/components/app/stat-strip";
import { Status, Tag } from "@/components/app/status";
import { Illustration } from "@/components/illustrations/illustration";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Part } from "@/components/scene-parts";
import { DOCUMENTS, docStatus, documentProgress } from "@/lib/sme/documents";
import { getReadiness } from "@/lib/sme/readiness";
import type { SmeProfile } from "@/lib/sme/types";
import { api } from "../../../convex/_generated/api";
import { isEsd } from "../../../convex/lib/kinds";
import { MatchCard } from "./matches-view";
import { useMatches } from "./opportunities-shared";

export function Overview({ sme }: { sme: SmeProfile }) {
  const { checks, score } = getReadiness(sme);
  const gaps = checks.filter((c) => !c.passed);
  const done = checks.filter((c) => c.passed);
  const neededDocs = DOCUMENTS.filter((d) => d.required && docStatus(sme, d.key) !== "ok");
  const docs = documentProgress(sme);

  return (
    <div className="space-y-8">
      {/* useSearchParams needs a Suspense boundary to keep the page prerenderable */}
      <Suspense>
        <WelcomeBanner sme={sme} />
      </Suspense>

      <Part id="page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{sme.companyName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[sme.industry, `${sme.city}, ${sme.hqProvince}`, `B-BBEE ${sme.bbbeeLevel}`].join(", ")}
        </p>
      </Part>

      <SmeSummary sme={sme} score={score} documents={docs} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Section title="Profile readiness" href="/sme/profile" linkLabel="Edit profile">
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm">
              <span className="font-medium tabular-nums">
                {done.length} of {checks.length}
              </span>{" "}
              <span className="text-muted-foreground">checks pass</span>
            </p>
            <div className="mt-3">
              <CheckSegments
                passed={done.length}
                total={checks.length}
                label={`${done.length} of ${checks.length} checks pass`}
              />
            </div>

            <ul className="mt-5 divide-y border-t">
              {gaps.length === 0 && <li className="py-3 text-sm">Your profile is fully match-ready.</li>}
              {gaps.map((g) => (
                <li key={g.id} className="flex gap-3 py-3 text-sm">
                  <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-label="To do" />
                  <span>
                    <span className="font-medium">{g.label}</span>
                    <span className="block text-muted-foreground">{g.fix}</span>
                  </span>
                </li>
              ))}
              {done.map((c) => (
                <li key={c.id} className="flex gap-3 py-2.5 text-sm text-muted-foreground">
                  <CheckIcon className="mt-0.5 size-4 shrink-0" aria-label="Done" />
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <div className="space-y-8">
          <Section title="Documents" href="/sme/documents" linkLabel="Manage">
            <div className="rounded-lg border bg-card">
              <p className="px-4 pt-4 text-sm">
                <span className="font-medium tabular-nums">
                  {docs.done} of {docs.total}
                </span>{" "}
                <span className="text-muted-foreground">uploaded</span>
              </p>
              {neededDocs.length === 0 ? (
                <p className="px-4 pt-1 pb-4 text-sm text-muted-foreground">All required documents are in place.</p>
              ) : (
                <ul className="mt-3 divide-y border-t">
                  {neededDocs.map((d) => {
                    const expired = docStatus(sme, d.key) === "expired";
                    return (
                      <li key={d.key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                        <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">{d.label}</span>
                        <Status tone={expired ? "danger" : "warning"}>{expired ? "Expired" : "Needed"}</Status>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Section>

          <Section title="Where you’re matched">
            <div className="flex flex-wrap gap-1.5">
              {(sme.nationwide ? ["Nationwide"] : sme.provinces).map((p) => (
                <Tag key={p}>{p}</Tag>
              ))}
            </div>
            {sme.serviceAreas.length > 0 && (
              <p className="text-sm text-muted-foreground">Priority areas: {sme.serviceAreas.join(", ")}</p>
            )}
          </Section>
        </div>
      </div>

      <LatestMatches sme={sme} />
    </div>
  );
}

/** The SME's figures at a glance: readiness, open matches, applications and documents. */
function SmeSummary({
  sme,
  score,
  documents,
}: {
  sme: SmeProfile;
  score: number;
  documents: ReturnType<typeof documentProgress>;
}) {
  const matches = useMatches(sme);
  const applications = useQuery(api.smeOpportunities.myApplications);
  const newMatches = (matches ?? []).filter((m) => !isEsd(m.kind) && !m.application && m.reach !== "outside").length;
  const submitted = (applications ?? []).filter((r) => r.status === "submitted").length;
  const unfinished = (applications ?? []).filter(
    (r) => r.status === "in_progress" && !isFinished(phaseOf(r.opportunity)),
  ).length;
  const missing = documents.requiredTotal - documents.requiredDone;

  return (
    <StatStrip
      variant="brand"
      items={[
        {
          label: "Profile readiness",
          icon: GaugeIcon,
          value: `${score}%`,
          href: "/sme/profile",
          context: score === 100 ? "Fully match-ready" : "Complete the checks below",
        },
        {
          label: "Open matches",
          icon: TargetIcon,
          value: matches === undefined ? "–" : newMatches,
          context: newMatches ? undefined : "We’ll alert you when one fits",
          action: newMatches ? { label: "See matches", href: "/sme/matches" } : undefined,
        },
        {
          label: "Applications submitted",
          icon: SendIcon,
          value: applications === undefined ? "–" : submitted,
          href: "/sme/opportunities",
          context: unfinished ? undefined : "None in progress",
          action: unfinished ? { label: `Finish ${unfinished} in progress`, href: "/sme/opportunities" } : undefined,
        },
        {
          label: "Documents",
          icon: FolderOpenIcon,
          value: `${documents.done} of ${documents.total}`,
          context: missing ? undefined : "All required documents in place",
          action: missing ? { label: `Upload ${missing} required`, href: "/sme/documents" } : undefined,
        },
      ]}
    />
  );
}

/** The best open matches the SME hasn't applied to yet. */
function LatestMatches({ sme }: { sme: SmeProfile }) {
  const matches = useMatches(sme);
  const top = (matches ?? []).filter((m) => !isEsd(m.kind) && !m.application && m.reach !== "outside").slice(0, 3);

  return (
    <Section title="Latest matches" href="/sme/matches" linkLabel="All matches">
      {matches === undefined ? (
        <Spinner className="mx-auto my-6" />
      ) : top.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState illustration="searching" title="No new matches right now" size="sm">
            When a buyer posts a tender, RFQ or grant that fits {sme.companyName}, it appears here and we email{" "}
            {sme.email}.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {top.map((m) => (
            <MatchCard key={m.id} match={m} sme={sme} />
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Shown once after registration, which links here with ?welcome=1. */
function WelcomeBanner({ sme }: { sme: SmeProfile }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  if (params.get("welcome") !== "1") return null;

  return (
    <div className="flex flex-col items-center gap-6 rounded-lg border bg-card p-6 sm:flex-row">
      <Illustration name="wellDone" className="h-28 shrink-0" />
      <div className="flex-1 text-center sm:text-left">
        <p className="text-lg font-semibold">Welcome, {sme.contactName.split(/\s+/)[0]}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {sme.companyName} is registered. We start matching you as soon as opportunities in your area are published.
          Complete the checks below to be matched to more of them.
        </p>
        <div className="mt-4 flex justify-center gap-2 sm:justify-start">
          <Button asChild size="sm">
            <Link href="/sme/documents">Upload documents</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
