"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BBBEE_LEVELS,
  CONTACT_ROLES,
  EMPLOYEE_BANDS,
  INDUSTRIES,
  PROVINCES,
  SERVICE_SUGGESTIONS,
  YEARS_TRADING,
} from "@/lib/sme/constants";
import { formatBytes } from "@/lib/sme/format";
import type { SmeForm, UpdateForm } from "@/lib/sme/form";
import type { Errors, StepId } from "@/lib/sme/validation";
import { cn } from "@/lib/utils";
import { CompanySummaryField } from "./company-summary";
import { Chips, ChipGroup, FileDrop, FormField, Row, SectionLabel, SelectInput, SwitchRow, TagInput } from "./controls";

export interface StepProps {
  form: SmeForm;
  errors: Errors;
  update: UpdateForm;
}

/* ---------- 1. Company ---------- */

export function CompanyStep({ form, errors, update }: StepProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <FormField
        label="Registered company name"
        htmlFor="companyName"
        error={errors.companyName}
        className="md:col-span-2"
      >
        <Input
          id="companyName"
          value={form.companyName}
          onChange={(e) => update({ companyName: e.target.value })}
          placeholder="e.g. Lethabo Facilities (Pty) Ltd"
          autoComplete="organization"
          aria-invalid={!!errors.companyName || undefined}
        />
      </FormField>

      <FormField
        label="CIPC registration number"
        htmlFor="registrationNumber"
        error={errors.registrationNumber}
        hint="Format: 2019/123456/07"
      >
        <Input
          id="registrationNumber"
          value={form.registrationNumber}
          onChange={(e) => update({ registrationNumber: e.target.value })}
          placeholder="YYYY/NNNNNN/NN"
          inputMode="numeric"
          aria-invalid={!!errors.registrationNumber || undefined}
        />
      </FormField>

      <FormField
        label="CSD supplier number"
        htmlFor="csdNumber"
        optional
        error={errors.csdNumber}
        hint="From National Treasury’s Central Supplier Database"
      >
        <Input
          id="csdNumber"
          value={form.csdNumber}
          onChange={(e) => update({ csdNumber: e.target.value })}
          placeholder="MAAA0123456"
          aria-invalid={!!errors.csdNumber || undefined}
        />
      </FormField>

      <FormField label="Industry" htmlFor="industry" error={errors.industry} className="md:col-span-2">
        <SelectInput
          id="industry"
          value={form.industry}
          onChange={(industry) => update({ industry })}
          placeholder="Select your main industry"
          options={INDUSTRIES}
          invalid={!!errors.industry}
        />
      </FormField>

      <FormField label="Years trading" htmlFor="yearsTrading" optional>
        <SelectInput
          id="yearsTrading"
          value={form.yearsTrading}
          onChange={(yearsTrading) => update({ yearsTrading })}
          placeholder="Select"
          options={YEARS_TRADING}
        />
      </FormField>

      <FormField label="Number of employees" htmlFor="employees" optional>
        <SelectInput
          id="employees"
          value={form.employees}
          onChange={(employees) => update({ employees })}
          placeholder="Select"
          options={EMPLOYEE_BANDS}
        />
      </FormField>

      <SectionLabel className="md:col-span-2">Location</SectionLabel>

      <FormField label="Street address" htmlFor="address" optional className="md:col-span-2">
        <Input
          id="address"
          value={form.address}
          onChange={(e) => update({ address: e.target.value })}
          placeholder="Unit, street and suburb"
          autoComplete="street-address"
        />
      </FormField>

      <FormField label="City or town" htmlFor="city" error={errors.city}>
        <Input
          id="city"
          value={form.city}
          onChange={(e) => update({ city: e.target.value })}
          placeholder="e.g. Soweto"
          autoComplete="address-level2"
          aria-invalid={!!errors.city || undefined}
        />
      </FormField>

      <FormField label="Head office province" htmlFor="hqProvince" error={errors.hqProvince}>
        <SelectInput
          id="hqProvince"
          value={form.hqProvince}
          onChange={(hqProvince) => update({ hqProvince })}
          placeholder="Select province"
          options={PROVINCES}
          invalid={!!errors.hqProvince}
        />
      </FormField>
    </div>
  );
}

/* ---------- 2. Services & capabilities ---------- */

export function OfferingStep({ form, errors, update }: StepProps) {
  const length = form.capabilities.trim().length;

  return (
    <div className="space-y-7">
      <FormField
        label="Services you offer"
        htmlFor="services"
        error={errors.services}
        hint="Press Enter after each service."
      >
        <TagInput
          id="services"
          value={form.services}
          onChange={(services) => update({ services })}
          placeholder="e.g. Office cleaning"
          suggestions={SERVICE_SUGGESTIONS[form.industry]}
          invalid={!!errors.services}
        />
      </FormField>

      <FormField
        label="Business capabilities"
        htmlFor="capabilities"
        error={errors.capabilities}
        hint={
          <span className="flex justify-between gap-4">
            <span>
              Capacity, equipment, team skills and past clients. Plain language is fine. This is what our AI matches on.
            </span>
            <span className="shrink-0 tabular-nums">{length}</span>
          </span>
        }
      >
        <Textarea
          id="capabilities"
          rows={6}
          value={form.capabilities}
          onChange={(e) => update({ capabilities: e.target.value })}
          placeholder="e.g. We run a team of 18 trained cleaners with our own industrial equipment and vehicles. We currently service three office parks in Midrand and have supplied Eskom and a private hospital group…"
          aria-invalid={!!errors.capabilities || undefined}
        />
      </FormField>

      <FormField
        label="Accreditations & certifications"
        htmlFor="accreditations"
        optional
        hint="e.g. CIDB grading, ISO 9001, PSIRA, SETA accreditation"
      >
        <TagInput
          id="accreditations"
          value={form.accreditations}
          onChange={(accreditations) => update({ accreditations })}
          placeholder="e.g. CIDB 3GB"
        />
      </FormField>

      <CompanySummaryField form={form} errors={errors} update={update} />
    </div>
  );
}

/* ---------- 3. Coverage ---------- */

export function CoverageStep({ form, errors, update }: StepProps) {
  const covered = form.nationwide ? ["All of South Africa"] : form.provinces;

  return (
    <div className="space-y-7">
      <SwitchRow
        checked={form.nationwide}
        onChange={(nationwide) => update({ nationwide })}
        label="We deliver nationwide"
        description="Turn this on if you can take on work in all nine provinces."
      />

      <FormField label="Provinces you serve" htmlFor="provinces" error={errors.provinces}>
        <ChipGroup
          id="provinces"
          options={PROVINCES}
          value={form.provinces}
          onChange={(provinces) => update({ provinces })}
          disabled={form.nationwide}
        />
      </FormField>

      <FormField
        label="Specific service areas"
        htmlFor="serviceAreas"
        optional
        hint="Cities, metros, municipalities or districts you prefer to work in."
      >
        <TagInput
          id="serviceAreas"
          value={form.serviceAreas}
          onChange={(serviceAreas) => update({ serviceAreas })}
          placeholder="e.g. City of Johannesburg, Ekurhuleni"
        />
      </FormField>

      {covered.length > 0 && (
        <div className="rounded-lg bg-muted p-4 text-sm">
          <span className="font-medium">You’ll be matched to opportunities in </span>
          <span className="text-muted-foreground">{covered.join(", ")}</span>
          {form.serviceAreas.length > 0 && (
            <span className="text-muted-foreground">, with priority for {form.serviceAreas.join(", ")}</span>
          )}
          .
        </div>
      )}
    </div>
  );
}

/* ---------- 4. Documents ---------- */

export function ComplianceDateFields({ form, errors, update }: StepProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="B-BBEE status level" htmlFor="bbbeeLevel" error={errors.bbbeeLevel}>
        <SelectInput
          id="bbbeeLevel"
          value={form.bbbeeLevel}
          onChange={(bbbeeLevel) => update({ bbbeeLevel })}
          placeholder="Select level"
          options={BBBEE_LEVELS}
          invalid={!!errors.bbbeeLevel}
        />
      </FormField>
      <FormField label="B-BBEE expiry date" htmlFor="bbbeeExpiry" optional error={errors.bbbeeExpiry}>
        <Input
          id="bbbeeExpiry"
          type="date"
          value={form.bbbeeExpiry}
          onChange={(e) => update({ bbbeeExpiry: e.target.value })}
          aria-invalid={!!errors.bbbeeExpiry || undefined}
        />
      </FormField>
      <FormField label="Tax clearance expiry date" htmlFor="taxExpiry" optional error={errors.taxExpiry}>
        <Input
          id="taxExpiry"
          type="date"
          value={form.taxExpiry}
          onChange={(e) => update({ taxExpiry: e.target.value })}
          aria-invalid={!!errors.taxExpiry || undefined}
        />
      </FormField>
      <FormField label="Website" htmlFor="website" error={errors.website}>
        <Input
          id="website"
          type="url"
          inputMode="url"
          value={form.website}
          onChange={(e) => update({ website: e.target.value })}
          placeholder="www.yourcompany.co.za"
          aria-invalid={!!errors.website || undefined}
        />
      </FormField>
    </div>
  );
}

export function DocumentsStep({ form, errors, update }: StepProps) {
  return (
    <div className="space-y-5">
      <DocSection
        title="B-BBEE certificate"
        description="Certificate from a SANAS-accredited verification agency, or a sworn affidavit for EMEs and QSEs."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="B-BBEE status level" htmlFor="bbbeeLevel" error={errors.bbbeeLevel}>
            <SelectInput
              id="bbbeeLevel"
              value={form.bbbeeLevel}
              onChange={(bbbeeLevel) => update({ bbbeeLevel })}
              placeholder="Select level"
              options={BBBEE_LEVELS}
              invalid={!!errors.bbbeeLevel}
            />
          </FormField>
          <FormField label="Expiry date" htmlFor="bbbeeExpiry" optional error={errors.bbbeeExpiry}>
            <Input
              id="bbbeeExpiry"
              type="date"
              value={form.bbbeeExpiry}
              onChange={(e) => update({ bbbeeExpiry: e.target.value })}
              aria-invalid={!!errors.bbbeeExpiry || undefined}
            />
          </FormField>
        </div>
        <FormField label="Upload certificate" htmlFor="bbbeeCertificate" error={errors.bbbeeCertificate}>
          <FileDrop
            id="bbbeeCertificate"
            file={form.bbbeeCertificate}
            onChange={(bbbeeCertificate) => update({ bbbeeCertificate })}
            invalid={!!errors.bbbeeCertificate}
          />
        </FormField>
      </DocSection>

      <DocSection title="Tax compliance" description="Your SARS Tax Compliance Status (TCS) PIN letter or certificate.">
        <FormField label="Upload tax compliance status" htmlFor="taxCertificate" error={errors.taxCertificate}>
          <FileDrop
            id="taxCertificate"
            file={form.taxCertificate}
            onChange={(taxCertificate) => update({ taxCertificate })}
            invalid={!!errors.taxCertificate}
          />
        </FormField>
        <FormField
          label="Expiry date"
          htmlFor="taxExpiry"
          optional
          error={errors.taxExpiry}
          className="md:max-w-[calc(50%-0.625rem)]"
        >
          <Input
            id="taxExpiry"
            type="date"
            value={form.taxExpiry}
            onChange={(e) => update({ taxExpiry: e.target.value })}
            aria-invalid={!!errors.taxExpiry || undefined}
          />
        </FormField>
      </DocSection>

      <DocSection
        title="Website or company profile"
        description="Add at least one, but both is best. Buyers use these to vet new suppliers."
      >
        <FormField label="Website" htmlFor="website" error={errors.website}>
          <Input
            id="website"
            type="url"
            inputMode="url"
            value={form.website}
            onChange={(e) => update({ website: e.target.value })}
            placeholder="www.yourcompany.co.za"
            aria-invalid={!!errors.website || undefined}
          />
        </FormField>
        <FormField label="Company profile" htmlFor="companyProfile" optional>
          <FileDrop
            id="companyProfile"
            file={form.companyProfile}
            onChange={(companyProfile) => update({ companyProfile })}
          />
        </FormField>
      </DocSection>
    </div>
  );
}

function DocSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border p-5 md:p-6">
      <div className="mb-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/* ---------- 5. Primary contact ---------- */

export function ContactStep({ form, errors, update }: StepProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Full name" htmlFor="contactName" error={errors.contactName}>
        <Input
          id="contactName"
          value={form.contactName}
          onChange={(e) => update({ contactName: e.target.value })}
          placeholder="e.g. Thandi Mokoena"
          autoComplete="name"
          aria-invalid={!!errors.contactName || undefined}
        />
      </FormField>

      <FormField label="Role in the business" htmlFor="contactRole" error={errors.contactRole}>
        <SelectInput
          id="contactRole"
          value={form.contactRole}
          onChange={(contactRole) => update({ contactRole })}
          placeholder="Select role"
          options={CONTACT_ROLES}
          invalid={!!errors.contactRole}
        />
      </FormField>

      <FormField label="Business email" htmlFor="email" hint="Your sign-in email. Change it in account settings.">
        <Input id="email" type="email" value={form.email} disabled readOnly />
      </FormField>

      <FormField
        label="Mobile number"
        htmlFor="phone"
        error={errors.phone}
        hint="For SMS & WhatsApp opportunity alerts."
      >
        <Input
          id="phone"
          type="tel"
          value={form.phone}
          onChange={(e) => update({ phone: e.target.value })}
          placeholder="082 123 4567"
          autoComplete="tel"
          aria-invalid={!!errors.phone || undefined}
        />
      </FormField>
    </div>
  );
}

/* ---------- 6. Review ---------- */

export function ReviewStep({ form, errors, update, onEdit }: StepProps & { onEdit: (step: StepId) => void }) {
  const docs = [
    ["B-BBEE", form.bbbeeCertificate],
    ["Tax compliance", form.taxCertificate],
    ["Company profile", form.companyProfile],
  ] as const;

  return (
    <div className="space-y-4">
      <ReviewCard title="Company" onEdit={() => onEdit("company")}>
        <Row label="Name" value={form.companyName} />
        <Row label="Registration no." value={form.registrationNumber} />
        <Row label="CSD number" value={form.csdNumber} />
        <Row label="Industry" value={form.industry} />
        <Row label="Location" value={[form.address, form.city, form.hqProvince].filter(Boolean).join(", ")} />
      </ReviewCard>

      <ReviewCard title="Services & capabilities" onEdit={() => onEdit("offering")}>
        <Row label="Services" value={<Chips items={form.services} />} />
        <Row label="Capabilities" value={<span className="line-clamp-3">{form.capabilities}</span>} />
        <Row label="Accreditations" value={form.accreditations.length ? <Chips items={form.accreditations} /> : ""} />
        <Row label="Company summary" value={<span className="line-clamp-3">{form.companySummary}</span>} />
      </ReviewCard>

      <ReviewCard title="Coverage" onEdit={() => onEdit("coverage")}>
        <Row label="Provinces" value={form.nationwide ? "Nationwide" : <Chips items={form.provinces} />} />
        <Row label="Service areas" value={form.serviceAreas.join(", ")} />
      </ReviewCard>

      <ReviewCard title="Documents" onEdit={() => onEdit("documents")}>
        <Row label="B-BBEE level" value={form.bbbeeLevel} />
        <Row label="Website" value={form.website} />
        <Row
          label="Uploads"
          value={
            <span className="flex flex-wrap gap-2">
              {docs.map(([label, file]) =>
                file ? (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                  </span>
                ) : null,
              )}
            </span>
          }
        />
      </ReviewCard>

      <ReviewCard title="Primary contact" onEdit={() => onEdit("contact")}>
        <Row label="Name" value={[form.contactName, form.contactRole].filter(Boolean).join(", ")} />
        <Row label="Email" value={form.email} />
        <Row label="Mobile" value={form.phone} />
      </ReviewCard>

      <label
        className={cn(
          "mt-2 flex cursor-pointer items-start gap-3 rounded-xl border p-5 text-sm leading-relaxed transition-colors",
          errors.consent ? "border-destructive" : form.consent ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        )}
      >
        <Checkbox
          id="consent"
          checked={form.consent}
          onCheckedChange={(checked) => update({ consent: checked === true })}
          aria-invalid={!!errors.consent || undefined}
          className="mt-0.5"
        />
        <span>
          I confirm these details are accurate and consent to MASLink processing them and sharing my business profile
          with corporates and funders for opportunity matching, in line with POPIA. I can view, export or withdraw this
          consent at any time.
          {errors.consent && <span className="mt-1 block text-destructive">{errors.consent}</span>}
        </span>
      </label>
    </div>
  );
}

function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between border-b px-5 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <dl className="divide-y px-5">{children}</dl>
    </section>
  );
}
