"use client";

import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DOCUMENTS, docStatus } from "@/lib/sme/documents";
import { getReadiness } from "@/lib/sme/readiness";
import type { SmeProfile } from "@/lib/sme/types";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { DocumentProgress } from "./document-progress";
import { MatchCard } from "./matches-view";
import { useMatches } from "./opportunities-shared";
import { ScoreRing } from "./score-ring";

export function Overview({ sme }: { sme: SmeProfile }) {
  const { checks, score } = getReadiness(sme);
  const gaps = checks.filter((c) => !c.passed);
  const done = checks.filter((c) => c.passed);
  const neededDocs = DOCUMENTS.filter((d) => d.required && docStatus(sme, d.key) !== "ok");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* useSearchParams needs a Suspense boundary to keep the page prerenderable */}
      <Suspense>
        <WelcomeBanner sme={sme} />
      </Suspense>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{sme.companyName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[sme.industry, `${sme.city}, ${sme.hqProvince}`, `B-BBEE ${sme.bbbeeLevel}`].join(" · ")}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Profile readiness</CardTitle>
            <CardDescription>Fix these to be matched to more opportunities.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <ScoreRing score={score} />
            <ul className="min-w-0 flex-1 divide-y">
              {gaps.length === 0 && <li className="py-3 text-sm">Your profile is fully match-ready.</li>}
              {gaps.map((g) => (
                <li key={g.id} className="py-3 text-sm first:pt-0">
                  <span className="font-medium">{g.label}</span>
                  <span className="block text-muted-foreground">{g.fix}</span>
                </li>
              ))}
              {done.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm text-muted-foreground">
                  {c.label}
                  <CheckIcon className="size-4 shrink-0 text-success" aria-label="Done" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Where you’re matched</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {(sme.nationwide ? ["Nationwide"] : sme.provinces).map((p) => (
                  <Badge key={p} variant="secondary">
                    {p}
                  </Badge>
                ))}
              </div>
              {sme.serviceAreas.length > 0 && (
                <p className="mt-3 text-[13px] text-muted-foreground">Priority areas: {sme.serviceAreas.join(", ")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardAction>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/sme/documents">Manage</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <DocumentProgress sme={sme} />
              {neededDocs.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                  {neededDocs.map((d) => {
                    const expired = docStatus(sme, d.key) === "expired";
                    return (
                      <li key={d.key} className="flex justify-between gap-3">
                        <span>{d.label}</span>
                        <span className={cn("shrink-0 text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
                          {expired ? "Expired" : "Needed"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <LatestMatches sme={sme} />
    </div>
  );
}

/** The best open matches the SME hasn't applied to yet. */
function LatestMatches({ sme }: { sme: SmeProfile }) {
  const matches = useMatches(sme);
  const top = (matches ?? []).filter((m) => !m.application && m.reach !== "outside").slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest matches</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sme/matches">See all matches</Link>
          </Button>
        </CardAction>
      </CardHeader>
      {matches === undefined ? (
        <CardContent className="py-6">
          <Spinner className="mx-auto" />
        </CardContent>
      ) : top.length === 0 ? (
        <CardContent className="px-4 py-10 text-center">
          <p className="font-medium">No new matches right now</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            When a corporate or funder posts a tender, RFQ or grant that fits {sme.companyName}, it’ll appear here and
            we’ll alert you at {sme.email}.
          </p>
        </CardContent>
      ) : (
        <CardContent>
          <ul className="space-y-3">
            {top.map((m) => (
              <MatchCard key={m.id} match={m} sme={sme} />
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

/** Shown once after registration, which links here with ?welcome=1. */
function WelcomeBanner({ sme }: { sme: SmeProfile }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  if (params.get("welcome") !== "1") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Welcome, {sme.contactName.split(/\s+/)[0]}</CardTitle>
        <CardDescription>
          {sme.companyName} is registered. We’ll start matching you as soon as opportunities in your area are
          published.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
            Dismiss
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
