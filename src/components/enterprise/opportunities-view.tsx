"use client";

import { BadgeCheckIcon, CircleSlashIcon, InboxIcon, ListChecksIcon } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader, Pill } from "@/components/admin/page-header";
import { Score } from "@/components/app/score";
import { StatStrip } from "@/components/app/stat-strip";
import { useBreadcrumb } from "@/components/portal/breadcrumbs";
import { FilterTabs, formatDateTime, runMutation, TablePagination, usePagination } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Part } from "@/components/scene-parts";
import { useUploadFile } from "@/hooks/use-upload-file";
import { errorMessage } from "@/lib/errors";
import { DOCUMENTS } from "@/lib/sme/documents";
import { formatBytes, formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import type { TenderRequirement } from "../../../convex/schema";
import { CreateOrganisation } from "./create-organisation";
import { OpportunityTable } from "./enterprise-overview";
import { ApplicantActions, ApplicantReview, ApplicantReviewStatus, EvaluationCard } from "./evaluation";
import { OpportunityActions } from "./opportunity-actions";
import { DepartmentSelect } from "./team-view";
import { RequirementsTab } from "./tender-requirements";
import { closingLabel, formatRand, KIND_LABELS, percent, PhasePill, isFinished, phaseOf } from "./tenders";

type Filter = "all" | "open" | "closing" | "closed";

function matches(row: Parameters<typeof phaseOf>[0], filter: Filter) {
  const phase = phaseOf(row);
  if (filter === "all") return true;
  if (filter === "open") return phase === "open" || phase === "closing";
  if (filter === "closed") return isFinished(phase);
  return phase === filter;
}

/** The Opportunities page: the full list, or one opportunity when the URL has ?id=. */
export function OpportunitiesView() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? (
    <OpportunityDetail opportunityId={id} />
  ) : (
    <OpportunityList initialDepartment={params.get("department") ?? "all"} />
  );
}

/** "all", "mine" (the user's departments), "none" (unassigned) or a department id. */
function inDepartment(row: { teamId: string | null }, department: string, myTeamIds: string[]) {
  if (department === "all") return true;
  if (department === "mine") return !!row.teamId && myTeamIds.includes(row.teamId);
  if (department === "none") return !row.teamId;
  return row.teamId === department;
}

function OpportunityList({ initialDepartment }: { initialDepartment: string }) {
  const data = useQuery(api.enterprise.overview);
  const [filter, setFilter] = useState<Filter>("all");
  const [department, setDepartment] = useState(initialDepartment);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => data?.opportunities ?? [], [data]);
  const myTeamIds = useMemo(() => data?.myTeamIds ?? [], [data]);
  const inScope = useMemo(
    () => rows.filter((r) => inDepartment(r, department, myTeamIds)),
    [rows, department, myTeamIds],
  );
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inScope.filter(
      (r) =>
        matches(r, filter) &&
        (!term || r.title.toLowerCase().includes(term) || r.reference.toLowerCase().includes(term)),
    );
  }, [inScope, filter, search]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [filter, department, search, setPage]);

  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  if (data === null) return <CreateOrganisation />;

  const count = (f: Filter) => inScope.filter((r) => matches(r, f)).length;

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Opportunities">
        <Button asChild>
          <Link href="/dashboard/opportunities/new">New opportunity</Link>
        </Button>
      </AdminPageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Filter opportunities"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: count("all") },
            { id: "open", label: "Open", count: count("open") },
            { id: "closing", label: "Closing this week", count: count("closing") },
            { id: "closed", label: "Closed", count: count("closed") },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {data.departments.length > 0 && (
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="sm:w-52" aria-label="Department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {data.myTeamIds.length > 0 && <SelectItem value="mine">My departments</SelectItem>}
                {data.departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">No department</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Input
            type="search"
            placeholder="Search by title or reference"
            aria-label="Search opportunities"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-72"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {visible.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "You haven’t listed any opportunities yet." : "No opportunities match."}
          </p>
        ) : (
          <OpportunityTable rows={pagination.rows} />
        )}
      </div>
      <TablePagination pagination={pagination} noun="opportunities" />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* One opportunity and its applicants                                                                     */
/* ------------------------------------------------------------------------------------------------------ */

type Detail = NonNullable<FunctionReturnType<typeof api.enterprise.opportunity>>;
type Applicant = Detail["applicants"][number];
type ApplicantFilter = "all" | "qualify" | "not";

const docLabel = (key: string) => DOCUMENTS.find((d) => d.key === key)?.label ?? key;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function OpportunityDetail({ opportunityId }: { opportunityId: string }) {
  const detail = useQuery(api.enterprise.opportunity, { opportunityId });
  useBreadcrumb(detail?.title);
  // Null until the user picks a filter, so it starts from the organisation's chosen default
  const [chosenFilter, setFilter] = useState<ApplicantFilter | null>(null);

  if (detail === undefined) return <Spinner className="mx-auto mt-24" />;
  if (detail === null) {
    return (
      <div className="py-24 text-center">
        <p className="font-medium">This opportunity isn’t available</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been removed, or it belongs to another organisation.
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard/opportunities">All opportunities</Link>
        </Button>
      </div>
    );
  }

  const phase = phaseOf(detail);
  const filter: ApplicantFilter = chosenFilter ?? detail.defaultApplicantFilter;
  const qualifying = detail.applicants.filter((a) => a.evaluation.qualifies);
  const visible = detail.applicants.filter((a) =>
    filter === "all" ? true : filter === "qualify" ? a.evaluation.qualifies : !a.evaluation.qualifies,
  );
  const reviewed = detail.applicants.some((a) => a.evaluation.engine === "jev");

  return (
    <div className="space-y-6">
      <Part id="opp-back">
        <Button variant="link" size="sm" className="-ml-3 text-muted-foreground" asChild>
          <Link href="/dashboard/opportunities">All opportunities</Link>
        </Button>
      </Part>

      <Part id="page-heading">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <PhasePill phase={phase} />
              <span className="text-sm text-muted-foreground">
                {KIND_LABELS[detail.kind]}, {detail.reference}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{detail.title}</h1>
            {detail.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{detail.description}</p>}
          </div>
          <OpportunityActions
            opportunityId={detail.id}
            reference={detail.reference}
            status={detail.status}
            canManage={detail.canAward}
          />
        </div>
      </Part>

      {detail.cancellation && (
        <div className="rounded-md border-l-4 border-l-destructive bg-destructive/10 p-4 text-sm">
          <p className="font-medium">
            Cancelled by {detail.cancellation.by} on {formatDateTime(detail.cancellation.at)}
          </p>
          <p className="mt-1 text-muted-foreground">{detail.cancellation.reason}</p>
        </div>
      )}

      <Part id="opp-facts">
        <dl className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Closes">
            {formatDate(detail.closesAt)}{" "}
            {!isFinished(phase) && (
              <span className="text-muted-foreground">({closingLabel(detail.closesAt).toLowerCase()})</span>
            )}
          </Fact>
          <Fact label="Value">{formatRand(detail.value)}</Fact>
          <Fact label="Where">{detail.provinces.length ? detail.provinces.join(", ") : "Nationwide"}</Fact>
          <Fact label="Industry">{detail.industry || "Any industry"}</Fact>
          <Fact label="Department">
            {detail.canAssignDepartment && detail.departments.length > 0 ? (
              <DepartmentSelect
                opportunityId={detail.id}
                value={detail.teamId}
                departments={detail.departments}
                allowed={detail.assignableDepartmentIds}
                className="mt-0.5 h-8 w-full"
              />
            ) : (
              (detail.teamName ?? "No department")
            )}
          </Fact>
          <Fact label="Minimum B-BBEE">{detail.minBbbeeLevel ? `Level ${detail.minBbbeeLevel}` : "None"}</Fact>
          <Fact label="Services">{detail.services.length ? detail.services.join(", ") : "Any"}</Fact>
          <div className="sm:col-span-2">
            <Fact label="Required documents">
              {detail.requiredDocuments.length ? detail.requiredDocuments.map(docLabel).join(", ") : "None"}
            </Fact>
          </div>
        </dl>
      </Part>

      <StatStrip
        items={[
          { label: "Applications", icon: InboxIcon, value: detail.applications },
          {
            label: "Meet the requirements",
            icon: BadgeCheckIcon,
            value: detail.qualified,
            context: `${percent(detail.qualified, detail.applications)}% of applicants`,
          },
          { label: "Don’t meet them", icon: CircleSlashIcon, value: detail.applications - detail.qualified },
          { label: "Shortlisted", icon: ListChecksIcon, value: detail.shortlisted },
        ]}
      />

      <Tabs defaultValue="applicants">
        <Part id="opp-tabs">
          <TabsList>
            <TabsTrigger value="applicants">Applicants ({detail.applicants.length})</TabsTrigger>
            <TabsTrigger value="requirements">
              Requirements{detail.tender ? " (" + detail.tender.requirements.length + ")" : ""}
            </TabsTrigger>
            <TabsTrigger value="listing">Listing and documents ({detail.documents.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </Part>

        <TabsContent value="applicants" className="space-y-6">
          <Part id="opp-evaluation">
            <EvaluationCard opportunityId={detail.id} applicants={detail.applicants.length} />
          </Part>
          <Part id="opp-applicants">
            <Card>
              <CardHeader>
                <CardTitle>Applicants</CardTitle>
                <CardDescription>
                  Ranked best fit first: SMEs that meet every requirement, then by score.{" "}
                  {detail.tender?.status === "confirmed"
                    ? "Scored on the tender’s own evaluation criteria and the returnable documents each SME supplied."
                    : reviewed
                      ? "Scored against your evaluation criteria."
                      : "Eligibility checked. Document review in progress."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-0">
                <div className="px-6">
                  <FilterTabs
                    label="Filter applicants"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { id: "all", label: "All", count: detail.applicants.length },
                      { id: "qualify", label: "Qualify", count: qualifying.length },
                      { id: "not", label: "Don’t qualify", count: detail.applicants.length - qualifying.length },
                    ]}
                  />
                </div>
                {visible.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-muted-foreground">
                    {detail.applicants.length === 0 ? "No SMEs have applied yet." : "No applicants in this group."}
                  </p>
                ) : (
                  <ApplicantTable
                    opportunityId={detail.id}
                    canShortlist={detail.canShortlist}
                    canAward={detail.canAward}
                    applicants={visible}
                    ranks={new Map(detail.applicants.map((a, i) => [a.id, i + 1]))}
                    requirements={detail.tender?.status === "confirmed" ? detail.tender.requirements : undefined}
                  />
                )}
              </CardContent>
            </Card>
          </Part>
        </TabsContent>

        <TabsContent value="requirements">
          <RequirementsTab detail={detail} />
        </TabsContent>

        <TabsContent value="listing" className="space-y-6">
          <ListingCard detail={detail} />
          <ReleasedDocumentsCard detail={detail} />
        </TabsContent>

        <TabsContent value="activity">
          <OpportunityActivityCard opportunityId={detail.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Listing, released documents and activity                                                               */
/* ------------------------------------------------------------------------------------------------------ */

function ListingCard({ detail }: { detail: Detail }) {
  const listing = detail.listing;
  if (!listing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Listing</CardTitle>
          <CardDescription>This opportunity was created before full listings were captured.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listing</CardTitle>
        <CardDescription>What was published for SMEs on {formatDateTime(listing.publishedAt)}.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-5 text-sm">
          <ListingItem label="Scope of work">
            <p className="whitespace-pre-line">{listing.scope}</p>
          </ListingItem>
          <div className="grid gap-5 sm:grid-cols-2">
            <ListingItem label="Contract period">{listing.contractPeriod || "Not stated"}</ListingItem>
            <ListingItem label="Briefing session">{listing.briefing || "No briefing session"}</ListingItem>
          </div>
          <ListingItem label="How to submit">{listing.submission}</ListingItem>
          <ListingItem label="Evaluation criteria">
            <ul className="list-disc space-y-1 pl-5">
              {listing.evaluationCriteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </ListingItem>
          <ListingItem label="Enquiries">
            {listing.enquiriesName},{" "}
            <a href={`mailto:${listing.enquiriesEmail}`} className="underline underline-offset-2">
              {listing.enquiriesEmail}
            </a>
          </ListingItem>
        </dl>
      </CardContent>
    </Card>
  );
}

function ListingItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const TENDER_DOC_ACCEPT = ".pdf,.docx,.xlsx,.png,.jpg,.jpeg";

function ReleasedDocumentsCard({ detail }: { detail: Detail }) {
  const upload = useUploadFile();
  const add = useMutation(api.enterprise.addOpportunityDocument);
  const remove = useMutation(api.enterprise.removeOpportunityDocument);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return toast.error("Choose a file to upload.");
    setPending(true);
    try {
      await add({
        opportunityId: detail.id,
        label: label || file.name.replace(/\.[^.]+$/, ""),
        file: await upload(file),
      });
      toast.success(`${file.name} added`);
      setLabel("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t upload the document."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents released with this opportunity</CardTitle>
        <CardDescription>
          The documents SMEs download to respond: the RFQ or terms of reference, specifications, pricing schedules and
          forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-0">
        {detail.documents.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">No documents released yet.</p>
        ) : (
          <ul className="divide-y border-y">
            {detail.documents.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{doc.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {doc.name}, {formatBytes(doc.size)}, added {formatDateTime(doc.uploadedAt)} by {doc.uploadedBy}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {doc.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={doc.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => runMutation(`${doc.label} removed`, () => remove({ documentId: doc.id }))}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="flex flex-col gap-2 px-6 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="tender-doc-label">Add a document</Label>
            <Input
              id="tender-doc-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What is it? e.g. Pricing schedule"
            />
          </div>
          <Input
            ref={fileInput}
            type="file"
            accept={TENDER_DOC_ACCEPT}
            aria-label="Choose a file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sm:w-64"
          />
          <Button type="submit" disabled={pending || !file}>
            {pending && <Spinner />}
            Upload
          </Button>
        </form>
        <p className="px-6 text-xs text-muted-foreground">PDF, Word, Excel or images, up to 10 MB.</p>
      </CardContent>
    </Card>
  );
}

function activityText(entry: { action: string; detail: string | null }) {
  switch (entry.action) {
    case "viewed":
      return "viewed the application";
    case "shortlisted":
      return "shortlisted";
    case "unshortlisted":
      return "removed from the shortlist";
    case "declined":
      return "declined";
    case "document_opened":
      return `opened ${entry.detail ?? "a document"}`;
    default:
      return entry.action;
  }
}

function OpportunityActivityCard({ opportunityId }: { opportunityId: Detail["id"] }) {
  const entries = useQuery(api.enterprise.opportunityActivity, { opportunityId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Who in your organisation viewed, shortlisted or opened documents for each applicant.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {entries === undefined ? (
          <Spinner className="mx-auto my-6" />
        ) : !entries || entries.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">No activity yet. Viewing an applicant is recorded here.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead className="pr-6">What</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="pl-6 text-sm whitespace-nowrap text-muted-foreground">
                    {formatDateTime(entry.at)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{entry.actorName}</TableCell>
                  <TableCell className="pr-6 text-sm">
                    {activityText(entry)} <span className="text-muted-foreground">({entry.companyName})</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_LABELS: Record<Applicant["status"], string> = {
  submitted: "Awaiting your decision",
  shortlisted: "Shortlisted",
  declined: "Not taken further",
  awarded: "Awarded",
};

function ApplicantTable({
  opportunityId,
  canShortlist,
  canAward,
  applicants,
  ranks,
  requirements,
}: {
  opportunityId: string;
  canShortlist: boolean;
  canAward: boolean;
  applicants: Applicant[];
  ranks: Map<string, number>;
  requirements?: TenderRequirement[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const recordView = useMutation(api.enterprise.recordApplicationView);
  // Logging a view is best effort; it must never get in the way of reading the application
  const viewed = (applicant: Applicant) => void recordView({ applicationId: applicant.id }).catch(() => {});

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 pl-6">Rank</TableHead>
          <TableHead>SME</TableHead>
          <TableHead>B-BBEE</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Result</TableHead>
          <TableHead className="pr-6 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {applicants.map((a) => {
          const expanded = open === a.id;
          return (
            <Fragment key={a.id}>
              <TableRow>
                <TableCell className="pl-6 font-medium tabular-nums">{ranks.get(a.id)}</TableCell>
                <TableCell className="max-w-72">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{a.sme.companyName}</span>
                    {a.sme.verified && <Pill tone="info">Verified</Pill>}
                    {a.status === "shortlisted" && <Pill tone="success">Shortlisted</Pill>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.sme.city}, {a.sme.hqProvince}, {a.sme.industry}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{a.sme.bbbeeLevel || "Not stated"}</TableCell>
                <TableCell>
                  <TenderScore evaluation={a.evaluation} />
                </TableCell>
                <TableCell>
                  {a.evaluation.qualifies ? (
                    <Pill tone="success">Qualifies</Pill>
                  ) : (
                    <Pill tone="danger">Doesn’t qualify</Pill>
                  )}
                  <ApplicantReviewStatus applicant={a} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {a.lastViewed
                      ? `Viewed by ${a.lastViewed.by}, ${formatDateTime(a.lastViewed.at)}`
                      : "Not viewed yet"}
                  </span>
                </TableCell>
                <TableCell className="pr-6">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={expanded}
                      onClick={() => {
                        if (!expanded) viewed(a);
                        setOpen(expanded ? null : a.id);
                      }}
                    >
                      {expanded ? "Hide" : "Details"}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/dashboard/suppliers?id=${a.sme.id}&from=${opportunityId}`}
                        onClick={() => viewed(a)}
                      >
                        View business
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={6} className="px-6 py-4 whitespace-normal">
                    <ApplicantChecks
                      applicant={a}
                      canAct={canShortlist}
                      canAward={canAward}
                      requirements={requirements}
                    />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * An applicant's score. With a confirmed tender it's the tender's own: technical points on its scoring rules
 * against the minimum, and returnable documents in order; otherwise the score out of 100.
 */
function TenderScore({ evaluation }: { evaluation: Applicant["evaluation"] }) {
  const { technical, returnables } = evaluation;
  if (!technical && !returnables) return <Score value={evaluation.score} />;
  return (
    <span className="block space-y-0.5 text-sm tabular-nums">
      {technical && (
        <span className="block">
          <span className="font-medium">{technical.points}</span>
          <span className="text-muted-foreground"> of {technical.available} points</span>
          {technical.threshold !== undefined && (
            <span className="block text-xs text-muted-foreground">
              {technical.points >= technical.threshold ? "Meets" : "Below"} the minimum of {technical.threshold}
            </span>
          )}
        </span>
      )}
      {returnables && returnables.total > 0 && (
        <span className="block text-xs text-muted-foreground">
          {returnables.met} of {returnables.total} returnables in order
          {returnables.partial ? `, ${returnables.partial} incomplete` : ""}
        </span>
      )}
    </span>
  );
}

function ApplicantChecks({
  applicant,
  canAct,
  canAward,
  requirements,
}: {
  applicant: Applicant;
  canAct: boolean;
  canAward: boolean;
  requirements?: TenderRequirement[];
}) {
  const { evaluation } = applicant;
  const required = evaluation.checks.filter((c) => c.required);
  const strengths = evaluation.checks.filter((c) => !c.required);

  const list = (checks: typeof evaluation.checks) => (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.id} className="flex items-baseline justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">{c.label}</span>
            <span className="block text-xs text-muted-foreground">{c.detail}</span>
          </span>
          <span
            className={
              c.passed ? "shrink-0 text-xs font-medium text-success" : "shrink-0 text-xs font-medium text-destructive"
            }
          >
            {c.passed ? "Met" : "Not met"}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium">{STATUS_LABELS[applicant.status]}</p>
          {applicant.statusReason ? (
            <p className="text-muted-foreground">
              {applicant.statusChangedBy}: {applicant.statusReason}
            </p>
          ) : (
            <p className="text-muted-foreground">No action taken yet.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ApplicantActions
            applicationId={applicant.id}
            companyName={applicant.sme.companyName}
            status={applicant.status}
            canAct={canAct}
            canAward={canAward}
          />
        </div>
      </div>
      <p className="text-sm">{evaluation.summary}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Requirements</p>
          {list(required)}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Strengths</p>
          {list(strengths)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Applied {formatDateTime(applicant.submittedAt)}, checked {formatDateTime(evaluation.evaluatedAt)} by{" "}
        {evaluation.engine === "jev" ? "document review" : "MASLink’s eligibility rules"}
      </p>
      <ApplicantReview
        applicationId={applicant.id}
        companyName={applicant.sme.companyName}
        evaluation={applicant.evaluation}
        requirements={requirements}
      />
      <ApplicationLog applicationId={applicant.id} companyName={applicant.sme.companyName} />
    </div>
  );
}

/** How many activity entries show inline before the rest move to the pop-up. */
const INLINE_ACTIVITY = 3;

type ActivityEntry = NonNullable<FunctionReturnType<typeof api.enterprise.applicationActivity>>[number];

function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap gap-x-2">
          <span className="text-muted-foreground tabular-nums">{formatDateTime(entry.at)}</span>
          <span>
            <span className="font-medium">{entry.actorName}</span> {activityText(entry)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Who in the organisation did what with one application: the latest few, and the rest in a pop-up. */
function ApplicationLog({ applicationId, companyName }: { applicationId: Applicant["id"]; companyName: string }) {
  const entries = useQuery(api.enterprise.applicationActivity, { applicationId });
  if (!entries || entries.length === 0) return null;

  return (
    <div className="border-t pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">Activity</p>
        {entries.length > INLINE_ACTIVITY && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="link" size="sm" className="h-auto p-0">
                View all activity ({entries.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Activity</DialogTitle>
                <DialogDescription>
                  Everything your organisation did with the application from {companyName}, newest first.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <ActivityList entries={entries} />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <ActivityList entries={entries.slice(0, INLINE_ACTIVITY)} />
    </div>
  );
}
