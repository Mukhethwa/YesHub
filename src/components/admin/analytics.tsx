"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BriefcaseBusinessIcon,
  InboxIcon,
  ListChecksIcon,
  StoreIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { BarChart } from "@/components/app/bar-chart";
import { ColumnChart } from "@/components/app/column-chart";
import { RefreshButton, RefreshScope, useTableState } from "@/components/app/data-toolbar";
import { ProvinceMap } from "@/components/app/province-map";
import { Section } from "@/components/app/section";
import { StatStrip } from "@/components/app/stat-strip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { downloadCsv } from "@/lib/csv";
import { change, countByBucket, type Period, periodOf, type Range, RANGES, within } from "@/lib/periods";
import { BBBEE_LEVELS } from "@/lib/sme/constants";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader } from "./page-header";
import { FilterTabs } from "./shared";

type Data = NonNullable<FunctionReturnType<typeof api.analytics.platform>>;

const KIND = {
  tender: { label: "Tenders", className: "bg-brand-blue" },
  rfq: { label: "RFQs", className: "bg-brand-green" },
  grant: { label: "Grants", className: "bg-brand-yellow" },
} as const;

const STATUS = {
  submitted: { label: "Submitted", className: "bg-brand-blue" },
  shortlisted: { label: "Shortlisted", className: "bg-brand-green" },
  awarded: { label: "Awarded", className: "bg-brand-yellow" },
  declined: { label: "Declined", className: "bg-brand-red" },
} as const;

const MAP_METRICS = {
  activity: { label: "Activity", unit: "actions", tone: "blue" },
  smes: { label: "SMEs", unit: "SMEs", tone: "green" },
  applications: { label: "Applications", unit: "applications", tone: "yellow" },
} as const;
type MapMetric = keyof typeof MAP_METRICS;

const rand = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function tally<T>(rows: T[], key: (row: T) => string | null) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    if (k) counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function provinceValues(
  metric: MapMetric,
  { smes, applications, activity }: Pick<Data, "smes" | "applications" | "activity">,
) {
  if (metric === "smes") return tally(smes, (s) => s.province);
  if (metric === "applications") return tally(applications, (a) => a.province);
  // SMEs' own actions plus their new profiles and applications
  return tally(
    [...activity.map((a) => a.province), ...smes.map((s) => s.province), ...applications.map((a) => a.province)],
    (p) => p,
  );
}

function MapMetricTabs({ value, onChange }: { value: MapMetric; onChange: (m: MapMetric) => void }) {
  return (
    <FilterTabs
      label="Map shows"
      value={value}
      onChange={onChange}
      options={(Object.keys(MAP_METRICS) as MapMetric[]).map((id) => ({ id, label: MAP_METRICS[id].label }))}
    />
  );
}

/** The province heat map for the last 30 days, for the admin overview. */
export function OverviewActivityMap() {
  const data = useQuery(api.analytics.platform);
  const now = useNow();
  const [metric, setMetric] = useState<MapMetric>("activity");
  if (!data || now === null) return null;
  const period = periodOf("30d", now);
  const current = (t: number) => within(t, period);
  const values = provinceValues(metric, {
    smes: data.smes.filter((s) => current(s.t)),
    applications: data.applications.filter((a) => current(a.t)),
    activity: data.activity.filter((a) => current(a.t)),
  });
  return (
    <Section
      title="Across South Africa, last 30 days"
      action={<MapMetricTabs value={metric} onChange={setMetric} />}
      href="/admin/analytics"
      linkLabel="Analytics"
    >
      <Card>
        <ProvinceMap values={values} unit={MAP_METRICS[metric].unit} tone={MAP_METRICS[metric].tone} />
      </Card>
    </Section>
  );
}

/** The change on the previous period, as a coloured chip on the blue band. */
function Delta({ after, before, previous }: { after: number; before: number; previous: string }) {
  const pct = change(after, before);
  if (pct === null) return <span>None in the {previous}</span>;
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? ArrowRightIcon : up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-sm px-1 py-px font-semibold tabular-nums",
          flat ? "bg-white/15 text-white" : up ? "bg-brand-green text-brand-navy" : "bg-brand-red text-white",
        )}
      >
        <Icon className="size-3" />
        {Math.abs(pct)}%
      </span>
      on {previous}
    </span>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border bg-card p-5", className)}>{children}</div>;
}

export function PlatformAnalytics() {
  return (
    <RefreshScope>
      <Analytics />
    </RefreshScope>
  );
}

function Analytics() {
  const data = useQuery(api.analytics.platform);
  const now = useNow();
  const [range, setRange] = useTableState<Range>("analytics.range", "30d");
  const [metric, setMetric] = useTableState<MapMetric>("analytics.map", "activity");
  const period = useMemo(() => (now === null ? null : periodOf(range, now)), [now, range]);

  const exportRows = () => {
    if (!data || !period) return;
    const series = {
      accounts: countByBucket(data.users, period),
      smes: countByBucket(
        data.smes.map((s) => s.t),
        period,
      ),
      applications: countByBucket(
        data.applications.map((a) => a.t),
        period,
      ),
      opportunities: countByBucket(
        data.opportunities.map((o) => o.t),
        period,
      ),
      activity: countByBucket(
        data.activity.map((a) => a.t),
        period,
      ),
    };
    downloadCsv(
      `analytics-${range}`,
      period.labels.map((label, i) => ({ label, i })),
      [
        { header: range === "12m" ? "Month" : range === "90d" ? "Week of" : "Day", value: (r) => r.label },
        { header: "New accounts", value: (r) => series.accounts[r.i] },
        { header: "New SMEs", value: (r) => series.smes[r.i] },
        { header: "Opportunities published", value: (r) => series.opportunities[r.i] },
        { header: "Applications", value: (r) => series.applications[r.i] },
        { header: "Actions", value: (r) => series.activity[r.i] },
      ],
    );
  };

  const header = (
    <AdminPageHeader title="Analytics">
      <div className="flex flex-wrap items-center gap-2">
        <FilterTabs
          label="Date range"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ id: r.id, label: r.label }))}
        />
        <RefreshButton />
        <Button variant="outline" onClick={exportRows} disabled={!data || !period}>
          Export
        </Button>
      </div>
    </AdminPageHeader>
  );

  if (data === undefined || period === null) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (data === null) return null;

  return (
    <div className="space-y-8">
      {header}
      <Report data={data} period={period} range={range} metric={metric} onMetric={setMetric} />
    </div>
  );
}

function Report({
  data,
  period,
  range,
  metric,
  onMetric,
}: {
  data: Data;
  period: Period;
  range: Range;
  metric: MapMetric;
  onMetric: (m: MapMetric) => void;
}) {
  const previous = RANGES.find((r) => r.id === range)!.previous;
  const current = (t: number) => within(t, period);
  const before = (t: number) => within(t, period.previous);

  const smes = data.smes.filter((s) => current(s.t));
  const applications = data.applications.filter((a) => current(a.t));
  const opportunities = data.opportunities.filter((o) => current(o.t));
  const activity = data.activity.filter((a) => current(a.t));
  const shortlisted = applications.filter((a) => a.status === "shortlisted" || a.status === "awarded");

  const mapValues = provinceValues(metric, { smes, applications, activity });

  const funnel = [
    { label: "Applied", value: applications.length, className: "bg-brand-blue" },
    {
      label: "Meet the requirements",
      value: applications.filter((a) => a.qualifies).length,
      className: "bg-primary/70",
    },
    { label: "Shortlisted", value: shortlisted.length, className: "bg-brand-green" },
    {
      label: "Awarded",
      value: applications.filter((a) => a.status === "awarded").length,
      className: "bg-brand-yellow",
    },
  ];

  const reviewed = applications.filter((a) => a.review);
  const reviewShortlisted = reviewed.filter((a) => a.review === "shortlisted").length;
  const overridden = reviewed.filter((a) => a.overridden).length;
  const decisionDays = median(applications.flatMap((a) => (a.decidedAfter === null ? [] : [a.decidedAfter])));

  const scoreBands = Array.from({ length: 10 }, (_, i) => i);
  const scoreCounts = scoreBands.map(
    (i) => applications.filter((a) => Math.min(9, Math.floor(a.score / 10)) === i).length,
  );

  const allIndustries = Object.entries(tally(data.smes, (s) => s.industry))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const levels = tally(data.smes, (s) => s.bbbee);

  return (
    <>
      <StatStrip
        variant="brand"
        items={[
          {
            label: "New SMEs",
            icon: StoreIcon,
            value: smes.length,
            context: (
              <Delta after={smes.length} before={data.smes.filter((s) => before(s.t)).length} previous={previous} />
            ),
          },
          {
            label: "Opportunities published",
            icon: BriefcaseBusinessIcon,
            value: opportunities.length,
            context: (
              <Delta
                after={opportunities.length}
                before={data.opportunities.filter((o) => before(o.t)).length}
                previous={previous}
              />
            ),
          },
          {
            label: "Applications",
            icon: InboxIcon,
            value: applications.length,
            context: (
              <Delta
                after={applications.length}
                before={data.applications.filter((a) => before(a.t)).length}
                previous={previous}
              />
            ),
          },
          {
            label: "Shortlist rate",
            icon: ListChecksIcon,
            value: `${percent(shortlisted.length, applications.length)}%`,
            context: `${shortlisted.length} of ${applications.length} applications`,
          },
        ]}
      />

      <Section title="Activity over time">
        <Card>
          <ColumnChart
            height={180}
            labels={period.labels}
            series={[
              {
                label: "Applications",
                className: "bg-brand-blue",
                values: countByBucket(
                  applications.map((a) => a.t),
                  period,
                ),
              },
              {
                label: "New SMEs",
                className: "bg-brand-green",
                values: countByBucket(
                  smes.map((s) => s.t),
                  period,
                ),
              },
              {
                label: "Opportunities",
                className: "bg-brand-yellow",
                values: countByBucket(
                  opportunities.map((o) => o.t),
                  period,
                ),
              },
            ]}
          />
        </Card>
      </Section>

      <Section title="Across South Africa" action={<MapMetricTabs value={metric} onChange={onMetric} />}>
        <Card>
          <ProvinceMap values={mapValues} unit={MAP_METRICS[metric].unit} tone={MAP_METRICS[metric].tone} />
        </Card>
      </Section>

      <div className="grid gap-8 lg:grid-cols-3">
        <Section title="From application to award" className="lg:col-span-2">
          <Card className="space-y-4">
            {funnel.map((step, i) => (
              <div key={step.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{step.label}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{step.value}</span>
                    {i > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {percent(step.value, funnel[0].value)}% of applicants
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-6 overflow-hidden rounded-sm bg-muted">
                  <div
                    className={cn("h-full rounded-sm", step.className)}
                    style={{ width: `${funnel[0].value ? (step.value / funnel[0].value) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </Card>
        </Section>

        <Section title="Automated shortlisting">
          <Card className="space-y-5">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Reviewed</dt>
                <dd className="text-2xl font-semibold tabular-nums">{reviewed.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Shortlisted</dt>
                <dd className="text-2xl font-semibold tabular-nums">{reviewShortlisted}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Changed by the buyer</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {overridden}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    {percent(overridden, reviewed.length)}%
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Median days to a decision</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {decisionDays === null ? "None" : decisionDays.toFixed(1)}
                </dd>
              </div>
            </dl>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              <span className="bg-brand-green" style={{ width: `${percent(reviewShortlisted, reviewed.length)}%` }} />
              <span
                className="bg-brand-red/70"
                style={{ width: `${percent(reviewed.length - reviewShortlisted, reviewed.length)}%` }}
              />
            </div>
          </Card>
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Application outcomes">
          <Card>
            <BarChart
              compact
              legend={[]}
              empty="No applications in this period."
              rows={(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((status) => ({
                key: status,
                label: STATUS[status].label,
                segments: [
                  {
                    value: applications.filter((a) => a.status === status).length,
                    className: STATUS[status].className,
                    label: "applications",
                  },
                ],
              }))}
            />
          </Card>
        </Section>

        <Section title="Scores">
          <Card>
            <ColumnChart
              height={140}
              labels={scoreBands.map((i) => `${i * 10}–${i * 10 + 9}`)}
              series={[
                { label: "Below 50", className: "bg-brand-red", values: scoreCounts.map((n, i) => (i < 5 ? n : 0)) },
                {
                  label: "50 to 69",
                  className: "bg-brand-yellow",
                  values: scoreCounts.map((n, i) => (i >= 5 && i < 7 ? n : 0)),
                },
                {
                  label: "70 and above",
                  className: "bg-brand-green",
                  values: scoreCounts.map((n, i) => (i >= 7 ? n : 0)),
                },
              ]}
            />
          </Card>
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Section title="Opportunities by type">
          <Card>
            <BarChart
              compact
              legend={[]}
              empty="Nothing published in this period."
              rows={(Object.keys(KIND) as (keyof typeof KIND)[]).map((kind) => {
                const list = opportunities.filter((o) => o.kind === kind);
                const value = list.reduce((sum, o) => sum + (o.value ?? 0), 0);
                return {
                  key: kind,
                  label: value ? `${KIND[kind].label}, ${rand(value)}` : KIND[kind].label,
                  segments: [{ value: list.length, className: KIND[kind].className, label: "published" }],
                };
              })}
            />
          </Card>
        </Section>

        <Section title="SMEs by B-BBEE level">
          <Card>
            <BarChart
              compact
              legend={[]}
              empty="No SMEs yet."
              rows={BBBEE_LEVELS.filter((l) => levels[l]).map((level, i) => ({
                key: level,
                label: level,
                segments: [
                  {
                    value: levels[level],
                    className: i < 2 ? "bg-brand-green" : i < 4 ? "bg-brand-blue" : "bg-brand-yellow",
                    label: "SMEs",
                  },
                ],
              }))}
            />
          </Card>
        </Section>

        <Section title="SMEs by industry">
          <Card>
            <BarChart
              compact
              legend={[]}
              empty="No SMEs yet."
              rows={allIndustries.map(([industry, count]) => ({
                key: industry,
                label: industry,
                segments: [{ value: count, className: "bg-brand-blue", label: "SMEs" }],
              }))}
            />
          </Card>
        </Section>
      </div>
    </>
  );
}
