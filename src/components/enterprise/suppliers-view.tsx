"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminPageHeader, Pill } from "@/components/admin/page-header";
import { useBreadcrumb } from "@/components/portal/breadcrumbs";
import { FilterTabs, TablePagination, usePagination } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROVINCES } from "@/lib/sme/constants";
import { isExpired } from "@/lib/sme/dates";
import { DOCUMENTS } from "@/lib/sme/documents";
import { formatBytes, formatDate, websiteHref } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CreateOrganisation } from "./create-organisation";
import { KIND_LABELS } from "./tenders";

type Supplier = NonNullable<FunctionReturnType<typeof api.enterprise.suppliers>>[number];
type Filter = "all" | "applied" | "verified";

/** The Find suppliers page: the directory, or one supplier's profile when the URL has ?id=. */
export function SuppliersView() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <SupplierProfile smeId={id} fromOpportunity={params.get("from")} /> : <SupplierDirectory />;
}

/** Documents on file, and how many of those have lapsed (only B-BBEE and tax certificates expire). */
function documentSummary(s: { documentKeys: string[]; bbbeeExpiry: string; taxExpiry: string }) {
  const expired =
    (s.documentKeys.includes("bbbeeCertificate") && isExpired(s.bbbeeExpiry) ? 1 : 0) +
    (s.documentKeys.includes("taxCertificate") && isExpired(s.taxExpiry) ? 1 : 0);
  return { onFile: s.documentKeys.length, total: DOCUMENTS.length, expired };
}

function matchesFilter(s: Supplier, filter: Filter) {
  if (filter === "applied") return s.applications > 0;
  if (filter === "verified") return s.verified;
  return true;
}

function deliversIn(s: Supplier, province: string) {
  return province === "any" || s.nationwide || s.provinces.includes(province) || s.hqProvince === province;
}

function SupplierDirectory() {
  const suppliers = useQuery(api.enterprise.suppliers);
  const [filter, setFilter] = useState<Filter>("all");
  const [province, setProvince] = useState("any");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (suppliers ?? []).filter(
      (s) =>
        matchesFilter(s, filter) &&
        deliversIn(s, province) &&
        (!term ||
          [s.companyName, s.industry, s.city, ...s.services].some((field) => field.toLowerCase().includes(term))),
    );
  }, [suppliers, filter, province, search]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [filter, province, search, setPage]);

  if (suppliers === undefined) return <Spinner className="mx-auto mt-24" />;
  if (suppliers === null) return <CreateOrganisation />;

  const count = (f: Filter) => suppliers.filter((s) => matchesFilter(s, f)).length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Find suppliers"
        description="SMEs on YES Hub that share their profile with corporates, and every SME that applied to your opportunities."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Filter suppliers"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: count("all") },
            { id: "applied", label: "Applied to you", count: count("applied") },
            { id: "verified", label: "Verified by YES Hub", count: count("verified") },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger className="sm:w-48" aria-label="Delivers in">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any province</SelectItem>
              {PROVINCES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="search"
            placeholder="Search name, service or industry"
            aria-label="Search suppliers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-72"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {visible.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">No suppliers match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Business</TableHead>
                <TableHead>Delivers in</TableHead>
                <TableHead>B-BBEE</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead className="text-right">Applied to you</TableHead>
                <TableHead className="pr-6 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.rows.map((s) => {
                const docs = documentSummary(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-72 pl-6">
                      <span className="flex items-center gap-2">
                        <Link href={`/dashboard/suppliers?id=${s.id}`} className="truncate font-medium hover:underline">
                          {s.companyName}
                        </Link>
                        {s.verified && <Pill tone="info">Verified</Pill>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.city}, {s.hqProvince} · {s.industry}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-sm">
                      {s.nationwide ? "Nationwide" : s.provinces.join(", ")}
                    </TableCell>
                    <TableCell className="text-sm">{s.bbbeeLevel || "Not stated"}</TableCell>
                    <TableCell className="text-sm">
                      <span className="tabular-nums">
                        {docs.onFile} of {docs.total}
                      </span>{" "}
                      <span className="text-muted-foreground">on file</span>
                      {docs.expired > 0 && (
                        <span className="block text-xs text-destructive">{docs.expired} expired</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.applications || ""}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/suppliers?id=${s.id}`}>View business</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      <TablePagination pagination={pagination} noun="suppliers" />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* One supplier                                                                                           */
/* ------------------------------------------------------------------------------------------------------ */

type Profile = NonNullable<FunctionReturnType<typeof api.enterprise.supplier>>;

const STATUS_LABELS = { submitted: "Applied", shortlisted: "Shortlisted", declined: "Declined", awarded: "Awarded" };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children || <span className="text-muted-foreground">Not stated</span>}</dd>
    </div>
  );
}

function SupplierProfile({ smeId, fromOpportunity }: { smeId: string; fromOpportunity: string | null }) {
  const profile = useQuery(api.enterprise.supplier, { smeId });
  useBreadcrumb(profile?.companyName);
  const back = fromOpportunity
    ? { href: `/dashboard/opportunities?id=${fromOpportunity}`, label: "Back to the opportunity" }
    : { href: "/dashboard/suppliers", label: "All suppliers" };

  if (profile === undefined) return <Spinner className="mx-auto mt-24" />;
  if (profile === null) {
    return (
      <div className="py-24 text-center">
        <p className="font-medium">This business isn’t available</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have hidden its profile from corporates, or been removed.
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href={back.href}>{back.label}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="link" size="sm" className="-ml-3 text-muted-foreground" asChild>
        <Link href={back.href}>{back.label}</Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{profile.companyName}</h1>
          {profile.verified && <Pill tone="info">Verified by YES Hub</Pill>}
          {profile.suspended && <Pill tone="danger">Suspended</Pill>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.industry} · {profile.city}, {profile.hqProvince}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>About the business</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="whitespace-pre-line">{profile.capabilities || "No capability statement yet."}</p>
              <TagList label="Services" items={profile.services} />
              <TagList label="Accreditations" items={profile.accreditations} />
            </CardContent>
          </Card>

          <DocumentsCard profile={profile} fromOpportunity={fromOpportunity} />
          <HistoryCard profile={profile} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Detail label="Registration no.">{profile.registrationNumber}</Detail>
                <Detail label="CSD number">{profile.csdNumber}</Detail>
                <Detail label="Years trading">{profile.yearsTrading}</Detail>
                <Detail label="Employees">{profile.employees}</Detail>
                <Detail label="B-BBEE">
                  {profile.bbbeeLevel}
                  {profile.bbbeeExpiry && (
                    <span
                      className={`block text-xs ${isExpired(profile.bbbeeExpiry) ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {isExpired(profile.bbbeeExpiry) ? "Expired" : "Valid until"} {formatDate(profile.bbbeeExpiry)}
                    </span>
                  )}
                </Detail>
                <Detail label="Tax clearance">
                  {profile.taxExpiry && (
                    <span className={isExpired(profile.taxExpiry) ? "text-destructive" : undefined}>
                      {isExpired(profile.taxExpiry) ? "Expired" : "Valid until"} {formatDate(profile.taxExpiry)}
                    </span>
                  )}
                </Detail>
                <Detail label="Website">
                  {profile.website && (
                    <a
                      href={websiteHref(profile.website)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {profile.website}
                    </a>
                  )}
                </Detail>
                <Detail label="Address">
                  {[profile.address, profile.city, profile.hqProvince].filter(Boolean).join(", ")}
                </Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where they deliver</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{profile.nationwide ? "Nationwide" : profile.provinces.join(", ") || "Not stated"}</p>
              {profile.serviceAreas.length > 0 && (
                <p className="text-muted-foreground">Prefers {profile.serviceAreas.join(", ")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {profile.contact ? (
                <dl className="divide-y">
                  <Detail label="Name">{profile.contact.contactName}</Detail>
                  <Detail label="Role">{profile.contact.contactRole}</Detail>
                  <Detail label="Email">
                    <a href={`mailto:${profile.contact.email}`} className="underline underline-offset-2">
                      {profile.contact.email}
                    </a>
                  </Detail>
                  <Detail label="Phone">
                    <a href={`tel:${profile.contact.phone}`} className="underline underline-offset-2">
                      {profile.contact.phone}
                    </a>
                  </Detail>
                </dl>
              ) : (
                <p className="text-muted-foreground">
                  This business shares its contact details once you shortlist it for one of your opportunities.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>On YES Hub</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Detail label="Member since">{formatDate(profile.memberSince)}</Detail>
                <Detail label="Verified">{profile.verifiedAt ? formatDate(profile.verifiedAt) : "Not yet"}</Detail>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function DocumentsCard({ profile, fromOpportunity }: { profile: Profile; fromOpportunity: string | null }) {
  const recordOpened = useMutation(api.enterprise.recordDocumentOpened);
  const byKey = new Map(profile.documents.map((d) => [d.key, d]));
  // Best effort: an activity entry on the application, never a blocker for opening the file
  const opened = (label: string) =>
    void recordOpened({
      smeId: profile.id,
      opportunityId: (fromOpportunity ?? undefined) as Id<"opportunities"> | undefined,
      document: label,
    }).catch(() => {});
  const expiryFor = (key: string) =>
    key === "bbbeeCertificate" ? profile.bbbeeExpiry : key === "taxCertificate" ? profile.taxExpiry : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          {profile.canViewDocuments
            ? "Open each document to check it against the details on this profile."
            : "You can open documents once this business applies to one of your opportunities. Until then you can see what’s on file."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y">
          {DOCUMENTS.map((type) => {
            const doc = byKey.get(type.key);
            const expiry = expiryFor(type.key);
            const expired = !!doc && isExpired(expiry);
            return (
              <li
                key={type.key}
                className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {type.label}
                    {!doc ? (
                      <Pill tone="neutral">Not on file</Pill>
                    ) : expired ? (
                      <Pill tone="danger">Expired {formatDate(expiry)}</Pill>
                    ) : (
                      <Pill tone="success">{expiry ? `Valid until ${formatDate(expiry)}` : "On file"}</Pill>
                    )}
                  </p>
                  {doc && (
                    <p className="truncate text-xs text-muted-foreground">
                      {doc.name} · {formatBytes(doc.size)} · uploaded {formatDate(doc.uploadedAt)}
                    </p>
                  )}
                </div>
                {doc &&
                  (doc.url ? (
                    <Button variant="outline" size="sm" asChild className="shrink-0">
                      <a href={doc.url} target="_blank" rel="noreferrer" onClick={() => opened(type.label)}>
                        Open document
                      </a>
                    </Button>
                  ) : (
                    profile.canViewDocuments && (
                      <span className="shrink-0 text-xs text-muted-foreground">File not uploaded yet</span>
                    )
                  ))}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ profile }: { profile: Profile }) {
  const shortlisted = profile.history.filter((h) => h.status === "shortlisted" || h.status === "awarded").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>History with {profile.organizationName}</CardTitle>
        <CardDescription>
          {profile.history.length === 0
            ? "This business hasn’t applied to your opportunities yet."
            : `${profile.history.length} application${profile.history.length === 1 ? "" : "s"} · ${shortlisted} shortlisted`}
        </CardDescription>
      </CardHeader>
      {profile.history.length > 0 && (
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Opportunity</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profile.history.map((h) => (
                <TableRow key={h.applicationId}>
                  <TableCell className="max-w-72 pl-6">
                    <Link
                      href={`/dashboard/opportunities?id=${h.opportunityId}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {h.title}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {KIND_LABELS[h.kind]} · {h.reference}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(h.submittedAt)}</TableCell>
                  <TableCell>
                    {h.qualifies ? <Pill tone="success">Qualifies</Pill> : <Pill tone="danger">Doesn’t qualify</Pill>}
                    <span className="mt-1 block text-xs text-muted-foreground tabular-nums">Score {h.score}</span>
                  </TableCell>
                  <TableCell className="pr-6 text-sm">{STATUS_LABELS[h.status]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
