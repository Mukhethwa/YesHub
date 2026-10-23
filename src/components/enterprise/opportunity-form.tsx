"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin/page-header";
import { useBreadcrumb } from "@/components/portal/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useUploadFile } from "@/hooks/use-upload-file";
import { errorMessage } from "@/lib/errors";
import { INDUSTRIES, PROVINCES } from "@/lib/sme/constants";
import { DOCUMENTS } from "@/lib/sme/documents";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { OpportunityKind } from "../../../convex/schema";
import { CreateOrganisation } from "./create-organisation";
import { KIND_LABELS } from "./tenders";

/*
 * Creating and editing an opportunity. The reference is generated when it's first saved and never changes.
 * Drafts save freely; a published opportunity is amended by owners and admins with a reason, which goes on
 * the audit log with every field that changed. A tender PDF attached when creating is released with it and
 * read into the requirements register straight away.
 */

type Form = {
  kind: OpportunityKind;
  title: string;
  description: string;
  industry: string;
  services: string;
  provinces: string[];
  minBbbeeLevel: string;
  requiredDocuments: string[];
  value: string;
  closesAt: string;
  teamId: string;
  scope: string;
  contractPeriod: string;
  briefing: string;
  submission: string;
  evaluationCriteria: string;
  enquiriesName: string;
  enquiriesEmail: string;
};

const lines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/** A date a few weeks out, as yyyy-mm-dd: a sensible first closing date. */
function inDays(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** The page at /dashboard/opportunities/new, and /dashboard/opportunities/new?id= to edit one. */
export function OpportunityFormPage() {
  const params = useSearchParams();
  const id = params.get("id");
  const settings = useQuery(api.enterprise.settings);
  const overview = useQuery(api.enterprise.overview);
  const existing = useQuery(api.enterprise.opportunity, id ? { opportunityId: id } : "skip");
  useBreadcrumb(id ? (existing?.reference ?? "Edit") : "New opportunity");

  if (settings === undefined || overview === undefined || (id && existing === undefined)) {
    return <Spinner className="mx-auto mt-24" />;
  }
  if (settings === null || overview === null) return <CreateOrganisation />;
  if (id && !existing) {
    return <p className="py-24 text-center text-sm text-muted-foreground">That opportunity isn’t available.</p>;
  }

  const s = settings.settings;
  const initial: Form = existing
    ? {
        kind: existing.kind,
        title: existing.title,
        description: existing.description,
        industry: existing.industry,
        services: existing.services.join(", "),
        provinces: existing.provinces,
        minBbbeeLevel: existing.minBbbeeLevel ? String(existing.minBbbeeLevel) : "none",
        requiredDocuments: existing.requiredDocuments,
        value: existing.value ? String(existing.value) : "",
        closesAt: existing.closesAt,
        teamId: existing.teamId ?? "none",
        scope: existing.listing?.scope ?? "",
        contractPeriod: existing.listing?.contractPeriod ?? "",
        briefing: existing.listing?.briefing ?? "",
        submission: existing.listing?.submission ?? "",
        evaluationCriteria: (existing.listing?.evaluationCriteria ?? []).join("\n"),
        enquiriesName: existing.listing?.enquiriesName ?? "",
        enquiriesEmail: existing.listing?.enquiriesEmail ?? "",
      }
    : {
        kind: "rfq",
        title: "",
        description: "",
        industry: s.industry && INDUSTRIES.includes(s.industry) ? s.industry : "",
        services: "",
        provinces: [],
        minBbbeeLevel: s.defaultMinBbbeeLevel ? String(s.defaultMinBbbeeLevel) : "none",
        requiredDocuments: s.defaultRequiredDocuments,
        value: "",
        closesAt: inDays(21),
        teamId: overview.myTeamIds[0] ?? "none",
        scope: "",
        contractPeriod: "",
        briefing: "",
        submission: s.defaultSubmission,
        evaluationCriteria: s.defaultEvaluationCriteria.join("\n"),
        enquiriesName: "",
        enquiriesEmail: s.procurementEmail,
      };

  return (
    <OpportunityForm
      opportunityId={existing?.id}
      reference={existing?.reference}
      status={existing?.status ?? "draft"}
      initial={initial}
      canManage={settings.canManage}
      verified={settings.organization.verificationStatus === "verified"}
      departments={overview.departments}
    />
  );
}

function OpportunityForm({
  opportunityId,
  reference,
  status,
  initial,
  canManage,
  verified,
  departments,
}: {
  opportunityId?: Id<"opportunities">;
  reference?: string;
  status: string;
  initial: Form;
  canManage: boolean;
  verified: boolean;
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const create = useMutation(api.opportunities.create);
  const update = useMutation(api.opportunities.update);
  const addDocument = useMutation(api.enterprise.addOpportunityDocument);
  const readTender = useMutation(api.tenders.readTender);
  const upload = useUploadFile();
  const [form, setForm] = useState<Form>(initial);
  const [tenderFile, setTenderFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"draft" | "publish" | null>(null);
  const published = status !== "draft";
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: "provinces" | "requiredDocuments", value: string, on: boolean) =>
    set(key, on ? [...form[key], value] : form[key].filter((v) => v !== value));

  const payload = () => ({
    kind: form.kind,
    title: form.title,
    description: form.description,
    industry: form.industry,
    services: form.services
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    provinces: form.provinces,
    minBbbeeLevel: form.minBbbeeLevel === "none" ? undefined : Number(form.minBbbeeLevel),
    requiredDocuments: form.requiredDocuments,
    value: form.value.trim() ? Number(form.value.replace(/[\s,R]/gi, "")) : undefined,
    closesAt: form.closesAt,
    teamId: form.teamId === "none" ? undefined : form.teamId,
    scope: form.scope,
    contractPeriod: form.contractPeriod,
    briefing: form.briefing,
    submission: form.submission,
    evaluationCriteria: lines(form.evaluationCriteria),
    enquiriesName: form.enquiriesName,
    enquiriesEmail: form.enquiriesEmail,
  });

  const save = async (e: FormEvent, publish: boolean) => {
    e.preventDefault();
    setPending(publish ? "publish" : "draft");
    try {
      if (opportunityId) {
        await update({ opportunityId, ...payload(), reason: published ? reason : undefined });
        toast.success(published ? "Amendment saved and recorded." : "Draft saved.");
        router.push(`/dashboard/opportunities?id=${opportunityId}`);
        return;
      }
      const created = await create({ ...payload(), publish });
      if (tenderFile) {
        const file = await upload(tenderFile);
        const documentId = await addDocument({ opportunityId: created.id, label: "Tender document", file });
        await readTender({ opportunityId: created.id, documentId });
      }
      toast.success(
        `${created.reference} ${publish ? "published" : "saved as a draft"}.${
          tenderFile ? " The tender is being read; check its requirements under Requirements." : ""
        }`,
      );
      router.push(`/dashboard/opportunities?id=${created.id}`);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t save the opportunity."));
    } finally {
      setPending(null);
    }
  };

  return (
    <form onSubmit={(e) => save(e, false)} className="space-y-8">
      <AdminPageHeader
        title={opportunityId ? `Edit ${reference}` : "New opportunity"}
        description={
          opportunityId
            ? published
              ? "This opportunity is published. Your changes, and your reason for them, go on the audit log."
              : `Reference ${reference}, generated when the draft was created. It never changes.`
            : "A reference is generated when you save, and never changes, so documents, applications and the audit log can point to it."
        }
      />

      <Section title="The opportunity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Kind</FieldLabel>
            <Select value={form.kind} onValueChange={(v) => set("kind", v as OpportunityKind)} disabled={published}>
              <SelectTrigger aria-label="Kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as OpportunityKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!opportunityId && departments.length > 0 && (
            <Field>
              <FieldLabel>Department</FieldLabel>
              <Select value={form.teamId} onValueChange={(v) => set("teamId", v)}>
                <SelectTrigger aria-label="Department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <Field>
          <FieldLabel htmlFor="opp-title">Title</FieldLabel>
          <Input
            id="opp-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Office cleaning and hygiene services, 36 months"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="opp-description">Summary</FieldLabel>
          <Textarea
            id="opp-description"
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="One or two sentences SMEs see in their matches."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="opp-closes">Closing date</FieldLabel>
            <Input
              id="opp-closes"
              type="date"
              value={form.closesAt}
              onChange={(e) => set("closesAt", e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="opp-value">Estimated value (rand)</FieldLabel>
            <Input
              id="opp-value"
              inputMode="decimal"
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="opp-period">Contract period</FieldLabel>
            <Input
              id="opp-period"
              value={form.contractPeriod}
              onChange={(e) => set("contractPeriod", e.target.value)}
              placeholder="e.g. 36 months"
            />
          </Field>
        </div>
      </Section>

      <Section title="Who it’s for">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Industry</FieldLabel>
            <Select value={form.industry || "any"} onValueChange={(v) => set("industry", v === "any" ? "" : v)}>
              <SelectTrigger aria-label="Industry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any industry</SelectItem>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="opp-services">Services, separated by commas</FieldLabel>
            <Input
              id="opp-services"
              value={form.services}
              onChange={(e) => set("services", e.target.value)}
              placeholder="e.g. Office cleaning, Hygiene services"
            />
            <FieldDescription>Matched against the services on SME profiles.</FieldDescription>
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Where the work is</legend>
          <p className="text-xs text-muted-foreground">Leave all unticked for nationwide.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PROVINCES.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.provinces.includes(p)} onCheckedChange={(on) => toggle("provinces", p, !!on)} />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title="What applicants need">
        <Field className="sm:w-64">
          <FieldLabel>Minimum B-BBEE level</FieldLabel>
          <Select value={form.minBbbeeLevel} onValueChange={(v) => set("minBbbeeLevel", v)}>
            <SelectTrigger aria-label="Minimum B-BBEE level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No minimum</SelectItem>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Level {n} or better
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Documents applicants must hold</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DOCUMENTS.map((d) => (
              <label key={d.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.requiredDocuments.includes(d.key)}
                  onCheckedChange={(on) => toggle("requiredDocuments", d.key, !!on)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field>
          <FieldLabel htmlFor="opp-criteria">How bids are evaluated, one criterion per line</FieldLabel>
          <Textarea
            id="opp-criteria"
            rows={4}
            value={form.evaluationCriteria}
            onChange={(e) => set("evaluationCriteria", e.target.value)}
            placeholder={"Functionality: 70 points minimum to proceed\nPrice: 80 points\nB-BBEE: 20 points"}
          />
          <FieldDescription>
            Price and B-BBEE points are calculated with the 80/20 or 90/10 formula. For a detailed tender, attach the
            document and its requirements are read for you.
          </FieldDescription>
        </Field>
      </Section>

      <Section title="The listing">
        <Field>
          <FieldLabel htmlFor="opp-scope">Scope of work</FieldLabel>
          <Textarea id="opp-scope" rows={4} value={form.scope} onChange={(e) => set("scope", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="opp-briefing">Briefing session</FieldLabel>
            <Input
              id="opp-briefing"
              value={form.briefing}
              onChange={(e) => set("briefing", e.target.value)}
              placeholder="Leave empty if there isn’t one"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="opp-submission">How to submit</FieldLabel>
            <Input id="opp-submission" value={form.submission} onChange={(e) => set("submission", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="opp-enq-name">Enquiries contact</FieldLabel>
            <Input
              id="opp-enq-name"
              value={form.enquiriesName}
              onChange={(e) => set("enquiriesName", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="opp-enq-email">Enquiries email</FieldLabel>
            <Input
              id="opp-enq-email"
              type="email"
              value={form.enquiriesEmail}
              onChange={(e) => set("enquiriesEmail", e.target.value)}
            />
          </Field>
        </div>
        {!opportunityId && (
          <Field>
            <FieldLabel htmlFor="opp-tender">Tender document (PDF), optional</FieldLabel>
            <Input
              id="opp-tender"
              type="file"
              accept="application/pdf"
              onChange={(e) => setTenderFile(e.target.files?.[0] ?? null)}
            />
            <FieldDescription>
              Released with the opportunity. Its mandatory requirements, scored criteria and returnable documents are
              read for you to check.
            </FieldDescription>
          </Field>
        )}
      </Section>

      {published && (
        <Section title="Why you’re changing it">
          <Field>
            <FieldLabel htmlFor="opp-reason">Reason for the amendment</FieldLabel>
            <Textarea
              id="opp-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Closing date extended by a week after questions at the briefing session."
              required
            />
            <FieldDescription>Recorded on the audit log with every field you changed.</FieldDescription>
          </Field>
        </Section>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" asChild>
          <Link href={opportunityId ? `/dashboard/opportunities?id=${opportunityId}` : "/dashboard/opportunities"}>
            Cancel
          </Link>
        </Button>
        {published ? (
          <Button type="submit" disabled={!!pending || !canManage || reason.trim().length < 10}>
            {pending && <Spinner />}
            Save amendment
          </Button>
        ) : (
          <>
            <Button type="submit" variant={canManage && verified ? "outline" : "default"} disabled={!!pending}>
              {pending === "draft" && <Spinner />}
              Save draft
            </Button>
            {canManage && verified && !opportunityId && (
              <Button type="button" disabled={!!pending} onClick={(e) => save(e, true)}>
                {pending === "publish" && <Spinner />}
                Publish
              </Button>
            )}
          </>
        )}
      </div>
      {!verified && !published && (
        <p className="text-right text-xs text-muted-foreground">
          MASLink is verifying your organisation. Save drafts now and publish once it’s verified.
        </p>
      )}
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <FieldGroup>{children}</FieldGroup>
    </section>
  );
}
