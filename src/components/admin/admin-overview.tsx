"use client";

import { useQuery } from "convex/react";
import { Building2Icon, StoreIcon, UserRoundIcon, UsersRoundIcon } from "lucide-react";

import { BarChart } from "@/components/app/bar-chart";
import { ColumnChart } from "@/components/app/column-chart";
import { EmptyState } from "@/components/app/empty-state";
import { Row, RowList, Section } from "@/components/app/section";
import { StatStrip } from "@/components/app/stat-strip";
import { Spinner } from "@/components/ui/spinner";
import { useNow } from "@/hooks/use-now";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { countByBucket, periodOf } from "@/lib/periods";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { OverviewActivityMap } from "./analytics";

const count = (n: number, more?: boolean) => `${n}${more ? "+" : ""}`;

const ORG_STATUS = {
  verified: { label: "Verified", className: "bg-brand-green" },
  unverified: { label: "Awaiting review", className: "bg-brand-yellow" },
  rejected: { label: "Rejected", className: "bg-brand-red" },
} as const;

function SignupsChart({ users, smes }: { users: number[]; smes: number[] }) {
  const now = useNow();
  if (now === null) return <div className="h-[140px]" />;
  const period = periodOf("30d", now);
  const accounts = countByBucket(users, period);
  const businesses = countByBucket(smes, period);
  return (
    <ColumnChart
      labels={period.labels}
      series={[
        { label: "SME profiles", className: "bg-brand-green", values: businesses },
        // Accounts that aren't (yet) an SME profile, so the stack adds up to all sign-ups
        {
          label: "Other accounts",
          className: "bg-brand-blue",
          values: accounts.map((n, i) => Math.max(0, n - businesses[i])),
        },
      ]}
    />
  );
}

export function AdminOverview() {
  const data = useQuery(api.admin.overview);
  const { role } = useStaffPermissions();

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  // Non-staff are redirected by the portal guard; nothing to show meanwhile
  if (data === null) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        {role && (
          <p className="mt-1 text-sm text-muted-foreground">Signed in as {ROLE_LABELS[role].label.toLowerCase()}</p>
        )}
      </div>

      <StatStrip
        variant="brand"
        items={[
          {
            label: "Accounts",
            icon: UsersRoundIcon,
            value: count(data.users.count, data.users.more),
            context: `${data.staff} staff, ${data.banned} banned`,
            href: "/admin/users",
          },
          {
            label: "SMEs",
            icon: StoreIcon,
            value: count(data.smes.count, data.smes.more),
            context: data.unverifiedSmes ? undefined : "All verified",
            action: data.unverifiedSmes ? { label: `Verify ${data.unverifiedSmes}`, href: "/admin/smes" } : undefined,
          },
          {
            label: "Enterprises",
            icon: Building2Icon,
            value: count(data.enterprises.count, data.enterprises.more),
            context: data.pendingEnterpriseCount ? undefined : "None waiting",
            action: data.pendingEnterpriseCount
              ? { label: `Review ${data.pendingEnterpriseCount}`, href: "/admin/organisations?status=unverified" }
              : undefined,
          },
        ]}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Sign-ups, last 30 days">
          <div className="rounded-lg border bg-card p-5">
            <SignupsChart users={data.userCreatedAt} smes={data.smeCreatedAt} />
          </div>
        </Section>
        <div className="space-y-8">
          <Section title="SMEs by province">
            <div className="rounded-lg border bg-card p-5">
              <BarChart
                rows={data.smesByProvince.slice(0, 6).map((p) => ({
                  key: p.province,
                  label: p.province,
                  segments: [{ value: p.count, className: "bg-brand-green", label: "SMEs" }],
                }))}
                legend={[]}
                compact
                empty="No SMEs yet."
              />
            </div>
          </Section>
          <Section title="Enterprises">
            <div className="rounded-lg border bg-card p-5">
              <BarChart
                rows={data.organizationsByStatus.map((o) => ({
                  key: o.status,
                  label: ORG_STATUS[o.status].label,
                  segments: [{ value: o.count, className: ORG_STATUS[o.status].className, label: "organisations" }],
                }))}
                legend={[]}
                compact
              />
            </div>
          </Section>
        </div>
      </div>

      <OverviewActivityMap />

      <Section
        title="Enterprises awaiting review"
        href="/admin/organisations?status=unverified"
        linkLabel="Review queue"
      >
        {data.pendingEnterprises.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState illustration="reviewedDocs" title="Nothing to review" size="sm">
              New organisations appear here when they sign up.
            </EmptyState>
          </div>
        ) : (
          <RowList>
            {data.pendingEnterprises.map((org) => (
              <Row
                key={org.id}
                href={`/admin/organisations?id=${org.id}`}
                icon={<Building2Icon />}
                title={org.name}
                subtitle={`${org.memberCount} ${org.memberCount === 1 ? "member" : "members"}, @${org.slug}`}
                aside={`Signed up ${formatDate(org.createdAt)}`}
              />
            ))}
          </RowList>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Newest accounts" href="/admin/users" linkLabel="All users">
          <RowList>
            {data.recentUsers.length === 0 && <Row title="No accounts yet" />}
            {data.recentUsers.map((u) => (
              <Row
                key={u.id}
                href="/admin/users"
                icon={<UserRoundIcon />}
                title={u.name}
                subtitle={u.email}
                aside={formatDate(u.createdAt)}
              />
            ))}
          </RowList>
        </Section>

        <Section title="Newest SMEs" href="/admin/smes" linkLabel="All SMEs">
          <RowList>
            {data.recentSmes.length === 0 && <Row title="No SMEs yet" />}
            {data.recentSmes.map((s) => (
              <Row
                key={s.id}
                href={`/admin/smes?id=${s.id}`}
                icon={<StoreIcon />}
                title={s.companyName}
                subtitle={`${s.city}, ${s.hqProvince}`}
                aside={formatDate(s.createdAt)}
              />
            ))}
          </RowList>
        </Section>
      </div>
    </div>
  );
}
