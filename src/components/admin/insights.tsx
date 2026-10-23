"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronDownIcon, DownloadIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { StatStrip } from "@/components/app/stat-strip";
import { Tag } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { InsightCategory } from "../../../convex/lib/insights";
import type { AnalyticsScope } from "./analytics";
import { AdminPageHeader } from "./page-header";
import { FilterTabs } from "./shared";

/*
 * Insights: the gaps many SMEs share, what each holds back, which buyers it affects, and how MASLink or
 * those buyers could support the SMEs. Narrow to a province or an industry to zoom into one group.
 */

type Data = NonNullable<FunctionReturnType<typeof api.insights.platform>>;
type Insight = Data["insights"][number];

const CATEGORIES: { id: "all" | InsightCategory; label: string }[] = [
  { id: "all", label: "All gaps" },
  { id: "documents", label: "Documents" },
  { id: "tender", label: "Tender requirements" },
  { id: "scoring", label: "Scoring" },
  { id: "eligibility", label: "Eligibility" },
  { id: "profile", label: "Profiles" },
  { id: "demand", label: "Unmet demand" },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) as Record<string, string>;

const rand = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

/** Today in the viewer's timezone, as the query expects. */
function todayIso(now: number) {
  const d = new Date(now);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function Insights({ scope = "platform" }: { scope?: AnalyticsScope }) {
  const org = scope === "organisation";
  const now = useNow(3_600_000);
  const [province, setProvince] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [category, setCategory] = useState<"all" | InsightCategory>("all");
  const data = useQuery(
    org ? api.insights.organisation : api.insights.platform,
    now === null
      ? "skip"
      : {
          today: todayIso(now),
          province: province === "all" ? undefined : province,
          industry: industry === "all" ? undefined : industry,
        },
  );
  const visible = useMemo(
    () => (data?.insights ?? []).filter((i) => category === "all" || i.category === category),
    [data, category],
  );

  const exportAll = () => {
    if (!data) return;
    const rows = visible.flatMap((insight) => insight.smes.map((sme) => ({ insight, sme })));
    downloadCsv("insights", rows, [
      { header: "Gap", value: (r) => r.insight.title },
      { header: "Kind of gap", value: (r) => CATEGORY_LABEL[r.insight.category] },
      { header: "SME", value: (r) => r.sme.name },
      { header: "Province", value: (r) => r.sme.province },
      { header: "Industry", value: (r) => r.sme.industry },
      ...(org ? [] : [{ header: "Email", value: (r: (typeof rows)[number]) => r.sme.email }]),
      { header: "Suggested support", value: (r) => r.insight.support },
    ]);
  };

  const filters = [province !== "all" && province, industry !== "all" && industry].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Insights"
        description={
          org
            ? "Where the SMEs applying to your listings fall short as a group, what it costs your listings, and how supplier development could close the gap."
            : "Where SMEs fall short as a group, what it holds back, and how to support them."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger className="w-44" aria-label="Province">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All provinces</SelectItem>
              {(data?.provinces ?? []).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="w-56" aria-label="Industry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All industries</SelectItem>
              {(data?.industries ?? []).map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportAll} disabled={!visible.length}>
            <DownloadIcon /> Export
          </Button>
        </div>
      </AdminPageHeader>

      {data === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data === null ? null : (
        <>
          <StatStrip
            part="insight-stats"
            items={[
              {
                label: org ? "Applicants analysed" : "SMEs analysed",
                value: data.analysed.smes,
                context: filters || (org ? "Every SME that applied" : "Every active SME"),
              },
              { label: "Applications analysed", value: data.analysed.applications },
              { label: org ? "Open listings" : "Open opportunities", value: data.analysed.openOpportunities },
              { label: "Gaps found", value: data.insights.length, context: "Shared by two or more" },
            ]}
          />

          <FilterTabs
            label="Kind of gap"
            value={category}
            onChange={setCategory}
            options={CATEGORIES.map((c) => ({
              id: c.id,
              label: c.label,
              count: c.id === "all" ? data.insights.length : data.insights.filter((i) => i.category === c.id).length,
            })).filter((c) => c.id === "all" || c.count)}
          />

          {visible.length === 0 ? (
            <div className="rounded-lg border bg-card">
              <EmptyState illustration="allChecked" title="No shared gaps here" size="sm">
                No gap reaches two or more SMEs{filters ? ` in ${filters}` : ""}. Try a wider group.
              </EmptyState>
            </div>
          ) : (
            <ol className="space-y-4">
              {visible.map((insight, i) => (
                <InsightCard key={insight.id} insight={insight} rank={i + 1} scope={scope} />
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function InsightCard({ insight, rank, scope }: { insight: Insight; rank: number; scope: AnalyticsScope }) {
  const org = scope === "organisation";
  const smeHref = (id: string) => (org ? `/dashboard/suppliers?id=${id}` : `/admin/smes?id=${id}`);
  const [open, setOpen] = useState(false);
  const held = insight.holdsBack;
  const holds =
    held.applications > 0
      ? `${held.applications} application${held.applications === 1 ? "" : "s"} to ${held.opportunities} opportunit${
          held.opportunities === 1 ? "y" : "ies"
        }${held.value ? ` worth ${rand(held.value)}` : ""}`
      : held.opportunities > 0
        ? `${held.opportunities} open opportunit${held.opportunities === 1 ? "y" : "ies"}${held.value ? ` worth ${rand(held.value)}` : ""}`
        : null;

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{rank}</span>
            <Tag>{CATEGORY_LABEL[insight.category]}</Tag>
          </div>
          <div>
            <h3 className="text-base font-semibold">{insight.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{insight.finding}</p>
          </div>
          <div className="rounded-md border-l-4 border-l-primary bg-muted/40 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              {org ? "What you can do" : "How to support them"}
            </p>
            <p className="mt-1">{insight.support}</p>
          </div>
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Reach</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {insight.affected}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                of {insight.total} {insight.unit}
              </span>
            </dd>
          </div>
          {holds && (
            <div>
              <dt className="text-xs text-muted-foreground">Holds back</dt>
              <dd>{holds}</dd>
            </div>
          )}
          {insight.buyers.length > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Buyers affected</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {insight.buyers.slice(0, 4).map((b) => (
                  <Tag key={b.name}>
                    {b.name}
                    {b.applications ? ` (${b.applications})` : ""}
                  </Tag>
                ))}
              </dd>
            </div>
          )}
          {insight.segments.length > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Most affected</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {insight.segments.map((s) => (
                  <Tag key={s.label}>
                    {s.label} ({s.count})
                  </Tag>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {insight.smes.length > 0 && (
        <div className="border-t">
          <button
            type="button"
            className="flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-muted/50"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span>
              {insight.category === "demand" ? "SMEs who offer it" : "SMEs affected"} ({insight.smes.length})
            </span>
            <ChevronDownIcon
              className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </button>
          {open && (
            <div className="border-t bg-muted/30 px-5 py-3">
              <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {insight.smes.map((sme) => (
                  <li key={sme.id} className="min-w-0">
                    <Link href={smeHref(sme.id)} className="font-medium hover:underline">
                      {sme.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[sme.industry, sme.province].filter(Boolean).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 -ml-2"
                onClick={() =>
                  downloadCsv(`insight-${insight.id}`, insight.smes, [
                    { header: "SME", value: (s) => s.name },
                    { header: "Province", value: (s) => s.province },
                    { header: "Industry", value: (s) => s.industry },
                    ...(org ? [] : [{ header: "Email", value: (s: Insight["smes"][number]) => s.email }]),
                  ])
                }
              >
                <DownloadIcon /> Download this list
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
