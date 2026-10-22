"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader } from "./page-header";

function Stat({
  label,
  value,
  more,
  href,
  note,
}: {
  label: string;
  value: number;
  more?: boolean;
  href: string;
  note?: string;
}) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-5 transition-colors hover:border-primary">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {value}
        {more && "+"}
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </Link>
  );
}

function ListCard({
  title,
  description,
  href,
  linkLabel,
  empty,
  children,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  empty: string | false;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href={href}>{linkLabel}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {empty && <li className="py-3 text-sm text-muted-foreground">{empty}</li>}
          {children}
        </ul>
      </CardContent>
    </Card>
  );
}

function Row({ href, title, subtitle, meta }: { href: string; title: string; subtitle: string; meta: string }) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-muted"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
      </Link>
    </li>
  );
}

export function AdminOverview() {
  const data = useQuery(api.admin.overview);
  const { role } = useStaffPermissions();

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  // Non-staff are redirected by the portal guard; nothing to show meanwhile
  if (data === null) return null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Overview"
        description={`What’s happening on YES Hub right now.${role ? ` You’re signed in as ${ROLE_LABELS[role].label.toLowerCase()}.` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Accounts"
          value={data.users.count}
          more={data.users.more}
          href="/admin/users"
          note={`${data.staff} staff · ${data.banned} banned`}
        />
        <Stat
          label="SMEs"
          value={data.smes.count}
          more={data.smes.more}
          href="/admin/smes"
          note={`${data.unverifiedSmes} to verify`}
        />
        <Stat
          label="Enterprises"
          value={data.enterprises.count}
          more={data.enterprises.more}
          href="/admin/organisations"
          note={`${data.pendingEnterpriseCount} awaiting review`}
        />
        <Stat
          label="Awaiting review"
          value={data.pendingEnterpriseCount}
          href="/admin/organisations?status=unverified"
        />
      </div>

      <ListCard
        title="Enterprises awaiting review"
        description="They can’t post opportunities until they’re verified."
        href="/admin/organisations?status=unverified"
        linkLabel="Review queue"
        empty={data.pendingEnterprises.length === 0 && "Nothing to review."}
      >
        {data.pendingEnterprises.map((org) => (
          <Row
            key={org.id}
            href={`/admin/organisations?id=${org.id}`}
            title={org.name}
            subtitle={`${org.memberCount} ${org.memberCount === 1 ? "member" : "members"} · @${org.slug}`}
            meta={formatDate(org.createdAt)}
          />
        ))}
      </ListCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ListCard
          title="Newest accounts"
          description="The last five people to sign up."
          href="/admin/users"
          linkLabel="All users"
          empty={data.recentUsers.length === 0 && "No accounts yet."}
        >
          {data.recentUsers.map((u) => (
            <Row key={u.id} href="/admin/users" title={u.name} subtitle={u.email} meta={formatDate(u.createdAt)} />
          ))}
        </ListCard>

        <ListCard
          title="Newest SMEs"
          description="The last five businesses to register."
          href="/admin/smes"
          linkLabel="All SMEs"
          empty={data.recentSmes.length === 0 && "No SMEs yet."}
        >
          {data.recentSmes.map((s) => (
            <Row
              key={s.id}
              href={`/admin/smes?id=${s.id}`}
              title={s.companyName}
              subtitle={`${s.city}, ${s.hqProvince}`}
              meta={formatDate(s.createdAt)}
            />
          ))}
        </ListCard>
      </div>
    </div>
  );
}
