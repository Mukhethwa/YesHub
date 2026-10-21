"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader } from "./page-header";

function Stat({ label, value, more, href }: { label: string; value: number; more?: boolean; href: string }) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-5 transition-colors hover:border-primary">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {value}
        {more && "+"}
      </p>
    </Link>
  );
}

export function AdminOverview() {
  const data = useQuery(api.admin.overview);

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  // Non-admins are redirected by the portal guard; nothing to show meanwhile
  if (data === null) return null;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Overview" description="What’s happening on YES Hub right now." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Accounts" value={data.users.count} more={data.users.more} href="/admin/users" />
        <Stat label="SMEs" value={data.smes.count} more={data.smes.more} href="/admin/smes" />
        <Stat label="Organisations" value={data.organizations.count} more={data.organizations.more} href="/admin/organisations" />
        <Stat label="Banned" value={data.banned} href="/admin/users" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Newest accounts</CardTitle>
            <CardDescription>The last five people to sign up.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/users">All users</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.recentUsers.length === 0 && <li className="py-3 text-sm text-muted-foreground">No accounts yet.</li>}
              {data.recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(u.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Newest SMEs</CardTitle>
            <CardDescription>The last five businesses to register.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/smes">All SMEs</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.recentSmes.length === 0 && <li className="py-3 text-sm text-muted-foreground">No SMEs yet.</li>}
              {data.recentSmes.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.companyName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.city}, {s.hqProvince}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(s.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
