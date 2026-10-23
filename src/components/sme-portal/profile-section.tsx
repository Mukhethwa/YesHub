"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { CompanySummaryField } from "@/components/sme/company-summary";
import { Chips, FileDrop, FormField, Row } from "@/components/sme/controls";
import { CompanyStep, ComplianceDateFields, ContactStep, CoverageStep, OfferingStep } from "@/components/sme/steps";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useUploadFile } from "@/hooks/use-upload-file";
import { errorMessage } from "@/lib/errors";
import { isExpired } from "@/lib/sme/dates";
import { formatBytes, formatDate, websiteHref } from "@/lib/sme/format";
import { formFromProfile, pickDetails, type SmeForm, type UpdateForm } from "@/lib/sme/form";
import type { DocKey, SmeProfile } from "@/lib/sme/types";
import {
  type Errors,
  validateCompanySummary,
  validateCompliance,
  validateContactDetails,
  validateStep,
} from "@/lib/sme/validation";
import { cn } from "@/lib/utils";
import type { SmeDetails } from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { SectionHeader } from "./require-sme";

type Part = "summary" | "company" | "offering" | "coverage" | "compliance" | "contact";

const PARTS: Record<Part, { title: string; fields: (keyof SmeDetails)[] }> = {
  summary: { title: "Professional company summary", fields: ["companySummary"] },
  company: {
    title: "Company details",
    fields: [
      "companyName",
      "registrationNumber",
      "csdNumber",
      "industry",
      "yearsTrading",
      "employees",
      "address",
      "city",
      "hqProvince",
    ],
  },
  offering: { title: "Services & capabilities", fields: ["services", "capabilities", "accreditations"] },
  coverage: { title: "Provinces & service areas", fields: ["nationwide", "provinces", "serviceAreas"] },
  compliance: { title: "Compliance", fields: ["bbbeeLevel", "bbbeeExpiry", "taxExpiry", "website"] },
  contact: { title: "Primary contact", fields: ["contactName", "contactRole", "phone"] },
};

/** The documents captured at registration; the full checklist lives on the Documents page. */
const DOCS: { key: "bbbeeCertificate" | "taxCertificate" | "companyProfile"; label: string }[] = [
  { key: "bbbeeCertificate", label: "B-BBEE certificate" },
  { key: "taxCertificate", label: "Tax compliance status" },
  { key: "companyProfile", label: "Company profile" },
];

function validate(part: Part, f: SmeForm, sme: SmeProfile): Errors {
  if (part === "compliance") {
    // Missing certificates are flagged by the readiness score instead of blocking other edits
    return validateCompliance(f, {
      bbbeeCertificate: true,
      taxCertificate: true,
      companyProfile: !!f.companyProfile || !!sme.documents.companyProfile,
    });
  }
  if (part === "contact") return validateContactDetails(f);
  if (part === "summary") return validateCompanySummary(f);
  return validateStep(part, f);
}

export function ProfileSection({ sme }: { sme: SmeProfile }) {
  const urls = useQuery(api.smes.documentUrls) ?? {};
  const updateProfile = useMutation(api.smes.update);
  const setDocument = useMutation(api.smes.setDocument);
  const uploadFile = useUploadFile();

  const [editing, setEditing] = useState<Part | null>(null);
  const [draft, setDraft] = useState<SmeForm>(() => formFromProfile(sme));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const start = (part: Part) => {
    setDraft(formFromProfile(sme));
    setErrors({});
    setSaveError(null);
    setEditing(part);
  };

  const update: UpdateForm = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch)) delete next[key as keyof Errors];
      return next;
    });
  };

  const save = async () => {
    if (!editing) return;
    const errs = validate(editing, draft, sme);
    if (Object.keys(errs).length) {
      setErrors(errs);
      requestAnimationFrame(() => document.getElementById(Object.keys(errs)[0])?.focus());
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (editing === "compliance") {
        // Upload replacements first, so a profile without a website keeps a company profile on file
        for (const { key } of DOCS) {
          const file = draft[key];
          if (file) await setDocument({ key, file: await uploadFile(file) });
        }
      }
      await updateProfile({ details: pickDetails(draft, PARTS[editing].fields) });
      toast.success(`${PARTS[editing].title} saved`);
      setEditing(null);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const stepProps = { form: draft, errors, update };

  const section = (part: Part, view: ReactNode, editor: ReactNode) => (
    <ProfileCard
      title={PARTS[part].title}
      editing={editing === part}
      locked={editing !== null && editing !== part}
      saving={saving}
      error={editing === part ? saveError : null}
      onEdit={() => start(part)}
      onCancel={() => setEditing(null)}
      onSave={save}
    >
      {editing === part ? editor : view}
    </ProfileCard>
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Business profile"
        description={`This is what corporates and funders see when you’re matched. Registered ${formatDate(sme._creationTime)}.`}
      />

      {section(
        "summary",
        sme.companySummary ? (
          <p className="text-sm whitespace-pre-line">{sme.companySummary}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No summary yet. It’s the introduction procurement teams read first on your supplier profile: who you are,
              what you deliver and why you’re a good fit.
            </p>
            <Button variant="outline" size="sm" onClick={() => start("summary")} disabled={editing !== null}>
              Write your summary
            </Button>
          </div>
        ),
        <CompanySummaryField {...stepProps} heading={false} />,
      )}

      {/* Two cards a row on wide screens; the one being edited takes the whole row */}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {section(
          "company",
          <dl className="divide-y">
            <Row label="Company name" value={sme.companyName} />
            <Row label="Registration no." value={sme.registrationNumber} />
            <Row label="CSD number" value={sme.csdNumber} />
            <Row label="Industry" value={sme.industry} />
            <Row label="Years trading" value={sme.yearsTrading} />
            <Row label="Employees" value={sme.employees} />
            <Row label="Address" value={sme.address} />
            <Row label="City or town" value={sme.city} />
            <Row label="Head office" value={sme.hqProvince} />
          </dl>,
          <CompanyStep {...stepProps} />,
        )}

        {section(
          "offering",
          <dl className="divide-y">
            <Row label="Services" value={sme.services.length ? <Chips items={sme.services} /> : ""} />
            <Row label="Capabilities" value={<span className="whitespace-pre-line">{sme.capabilities}</span>} />
            <Row label="Accreditations" value={sme.accreditations.length ? <Chips items={sme.accreditations} /> : ""} />
          </dl>,
          <OfferingStep {...stepProps} />,
        )}

        {section(
          "coverage",
          <dl className="divide-y">
            <Row label="Provinces" value={sme.nationwide ? "Nationwide" : <Chips items={sme.provinces} />} />
            <Row label="Service areas" value={sme.serviceAreas.join(", ")} />
          </dl>,
          <CoverageStep {...stepProps} />,
        )}

        {section(
          "compliance",
          <>
            <dl className="divide-y">
              <Row label="B-BBEE level" value={sme.bbbeeLevel} />
              <Row label="B-BBEE expiry" value={sme.bbbeeExpiry && <Expiry date={sme.bbbeeExpiry} />} />
              <Row label="Tax clearance expiry" value={sme.taxExpiry && <Expiry date={sme.taxExpiry} />} />
              <Row
                label="Website"
                value={
                  sme.website && (
                    <a
                      href={websiteHref(sme.website)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {sme.website}
                    </a>
                  )
                }
              />
              {DOCS.map(({ key, label }) => (
                <Row key={key} label={label} value={<DocLine sme={sme} docKey={key} url={urls[key]} />} />
              ))}
            </dl>
            <Link href="/sme/documents" className="mt-3 inline-block text-sm font-medium underline underline-offset-2">
              See all documents
            </Link>
          </>,
          <div className="space-y-5">
            <ComplianceDateFields {...stepProps} />
            {DOCS.map(({ key, label }) => {
              const current = sme.documents[key];
              return (
                <FormField
                  key={key}
                  label={current ? `${label}: upload a replacement` : `${label}: upload`}
                  htmlFor={key}
                  optional
                  hint={current ? `On file: ${current.name}. Leave empty to keep it.` : undefined}
                >
                  <FileDrop id={key} file={draft[key]} onChange={(file) => update({ [key]: file })} />
                </FormField>
              );
            })}
          </div>,
        )}

        {section(
          "contact",
          <dl className="divide-y">
            <Row label="Full name" value={sme.contactName} />
            <Row label="Role" value={sme.contactRole} />
            <Row label="Email (sign-in)" value={sme.email} />
            <Row label="Mobile" value={sme.phone} />
          </dl>,
          <ContactStep {...stepProps} />,
        )}
      </div>
    </div>
  );
}

function ProfileCard({
  title,
  editing,
  locked,
  saving,
  error,
  onEdit,
  onCancel,
  onSave,
  children,
}: {
  title: string;
  editing: boolean;
  locked: boolean;
  saving: boolean;
  error: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Card className={cn(editing && "ring-2 ring-primary/40 xl:col-span-2")}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {!editing && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onEdit} disabled={locked}>
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            {children}
            {error && (
              <p role="alert" className="mt-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Spinner />}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function Expiry({ date }: { date: string }) {
  return (
    <span>
      {formatDate(date)}
      {isExpired(date) && <span className="ml-2 text-destructive">Expired</span>}
    </span>
  );
}

function DocLine({ sme, docKey, url }: { sme: SmeProfile; docKey: DocKey; url?: string }) {
  const doc = sme.documents[docKey];
  if (!doc) return <span className="text-muted-foreground/70">Not uploaded</span>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-3">
      <span className="min-w-0 break-all">{doc.name}</span>
      <span className="text-muted-foreground">
        {formatBytes(doc.size)}, uploaded {formatDate(doc.uploadedAt)}
      </span>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          View
        </a>
      )}
    </span>
  );
}
