"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader, Pill } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/errors";
import { INDUSTRIES } from "@/lib/sme/constants";
import { DOCUMENTS } from "@/lib/sme/documents";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import type { MemberPreferences, OrganizationSettings } from "../../../convex/schema";
import { formatDateTime } from "../admin/shared";
import { CreateOrganisation } from "./create-organisation";

type Data = NonNullable<FunctionReturnType<typeof api.enterprise.settings>>;

const VERIFICATION: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  verified: { label: "Verified", tone: "success" },
  unverified: { label: "Awaiting verification", tone: "warning" },
  rejected: { label: "Verification declined", tone: "danger" },
};

export function EnterpriseSettingsView() {
  const data = useQuery(api.enterprise.settings);
  if (data === undefined) return <Spinner className="mx-auto mt-24" />;
  if (data === null) return <CreateOrganisation />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Settings"
        description={
          data.canManage ? undefined : "Managed by owners and admins. You can change your own notifications."
        }
      />
      {/* Keyed on the saved version so the forms reset to fresh values after a save */}
      <OrganisationSettings key={data.settings.updatedAt ?? "defaults"} data={data} />
      <NotificationPreferences key={JSON.stringify(data.preferences)} preferences={data.preferences} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Organisation-wide settings                                                                             */
/* ------------------------------------------------------------------------------------------------------ */

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Label className="flex items-start justify-between gap-6 font-normal">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Label>
  );
}

/** The editable settings, without who saved them and when. */
function settingsFrom(saved: Data["settings"]): OrganizationSettings {
  const settings: Partial<Data["settings"]> = { ...saved };
  delete settings.updatedAt;
  delete settings.updatedBy;
  return settings as OrganizationSettings;
}

function OrganisationSettings({ data }: { data: Data }) {
  const save = useMutation(api.enterprise.updateOrganizationSettings);
  const [name, setName] = useState(data.organization.name);
  const [draft, setDraft] = useState<OrganizationSettings>(() => settingsFrom(data.settings));
  const [criteria, setCriteria] = useState(data.settings.defaultEvaluationCriteria.join("\n"));
  const [pending, setPending] = useState(false);
  const readOnly = !data.canManage;
  const set = (patch: Partial<OrganizationSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const verification = VERIFICATION[data.organization.verificationStatus] ?? VERIFICATION.unverified;

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("Enter your organisation’s name.");
    setPending(true);
    try {
      if (name.trim() !== data.organization.name) {
        const { error } = await authClient.organization.update({ data: { name: name.trim() } });
        if (error) throw new Error(error.message || "Couldn’t rename the organisation.");
      }
      await save({ settings: { ...draft, defaultEvaluationCriteria: criteria.split("\n") } });
      toast.success("Organisation settings saved");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t save the settings."));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Section title="Organisation" description="How your organisation appears to SMEs on your listings.">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pill tone={verification.tone}>{verification.label}</Pill>
          <span className="text-muted-foreground">On MASLink since {formatDate(data.organization.createdAt)}</span>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Name" htmlFor="org-name">
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Industry" htmlFor="org-industry">
            <Select
              value={draft.industry || "none"}
              onValueChange={(v) => set({ industry: v === "none" ? "" : v })}
              disabled={readOnly}
            >
              <SelectTrigger id="org-industry" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not stated</SelectItem>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Website" htmlFor="org-website">
            <Input
              id="org-website"
              value={draft.website}
              onChange={(e) => set({ website: e.target.value })}
              placeholder="www.company.co.za"
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Procurement email"
            htmlFor="org-email"
            hint="Shown to SMEs as the enquiries address on new listings."
          >
            <Input
              id="org-email"
              type="email"
              value={draft.procurementEmail}
              onChange={(e) => set({ procurementEmail: e.target.value })}
              placeholder="tenders@company.co.za"
              disabled={readOnly}
            />
          </Field>
        </div>
        <Field label="About" htmlFor="org-about">
          <Textarea
            id="org-about"
            rows={3}
            value={draft.about}
            onChange={(e) => set({ about: e.target.value })}
            placeholder="What your organisation does and what it buys from SMEs."
            disabled={readOnly}
          />
        </Field>
      </Section>

      <Section
        title="Defaults for new listings"
        description="Filled in for you each time someone in your organisation publishes a tender, RFQ or grant. They can still change them per listing."
      >
        <Field label="Documents SMEs must hold">
          <div className="grid gap-2 sm:grid-cols-2">
            {DOCUMENTS.map((d) => (
              <Label key={d.key} className="flex items-center gap-2.5 font-normal">
                <Checkbox
                  checked={draft.defaultRequiredDocuments.includes(d.key)}
                  disabled={readOnly}
                  onCheckedChange={(checked) =>
                    set({
                      defaultRequiredDocuments: checked
                        ? [...draft.defaultRequiredDocuments, d.key]
                        : draft.defaultRequiredDocuments.filter((k) => k !== d.key),
                    })
                  }
                />
                {d.label}
              </Label>
            ))}
          </div>
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Minimum B-BBEE level" htmlFor="default-bbbee">
            <Select
              value={String(draft.defaultMinBbbeeLevel)}
              onValueChange={(v) => set({ defaultMinBbbeeLevel: Number(v) })}
              disabled={readOnly}
            >
              <SelectTrigger id="default-bbbee" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No minimum</SelectItem>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
                  <SelectItem key={level} value={String(level)}>
                    Level {level} or better
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Evaluation criteria" htmlFor="default-criteria" hint="One per line.">
          <Textarea
            id="default-criteria"
            rows={4}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            disabled={readOnly}
          />
        </Field>
        <Field label="How to submit" htmlFor="default-submission">
          <Textarea
            id="default-submission"
            rows={2}
            value={draft.defaultSubmission}
            onChange={(e) => set({ defaultSubmission: e.target.value })}
            disabled={readOnly}
          />
        </Field>
      </Section>

      <Section title="Reviewing applicants" description="How your team works through applications.">
        <Field label="Applicants shown first" htmlFor="default-filter">
          <Select
            value={draft.defaultApplicantFilter}
            onValueChange={(v) => set({ defaultApplicantFilter: v as OrganizationSettings["defaultApplicantFilter"] })}
            disabled={readOnly}
          >
            <SelectTrigger id="default-filter" className="w-full md:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone who applied</SelectItem>
              <SelectItem value="qualify">Only applicants who qualify</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <SwitchRow
          label="Only owners and admins shortlist"
          description="Members can still review applicants and open their documents."
          checked={draft.shortlistAdminsOnly}
          onChange={(shortlistAdminsOnly) => set({ shortlistAdminsOnly })}
          disabled={readOnly}
        />
      </Section>

      <Section title="Data and privacy" description="How long you keep applicants’ information, in line with POPIA.">
        <Field
          label="Keep applicants’ data for"
          htmlFor="retention"
          hint="After an opportunity closes. Shortlisted and awarded suppliers’ records are kept for your audit trail."
        >
          <Select
            value={String(draft.retentionMonths)}
            onValueChange={(v) => set({ retentionMonths: Number(v) })}
            disabled={readOnly}
          >
            <SelectTrigger id="retention" className="w-full md:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[6, 12, 24, 36, 60].map((months) => (
                <SelectItem key={months} value={String(months)}>
                  {months} months
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      {data.canManage && (
        <div className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {data.settings.updatedAt
              ? `Last saved ${formatDateTime(data.settings.updatedAt)} by ${data.settings.updatedBy}.`
              : "Using MASLink’s defaults until you save."}
          </p>
          <Button onClick={submit} disabled={pending}>
            {pending && <Spinner />}
            Save organisation settings
          </Button>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Personal notification preferences                                                                      */
/* ------------------------------------------------------------------------------------------------------ */

function NotificationPreferences({ preferences }: { preferences: MemberPreferences }) {
  const save = useMutation(api.enterprise.updatePreferences);
  const [draft, setDraft] = useState(preferences);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<MemberPreferences>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences);

  const submit = async () => {
    setPending(true);
    try {
      await save({ preferences: draft });
      toast.success("Your notifications are saved");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t save your notifications."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Section title="Your notifications" description="Just for you. Everyone in your organisation chooses their own.">
      <SwitchRow
        label="New applications"
        description="When an SME applies to one of your organisation’s opportunities."
        checked={draft.notifyNewApplications}
        onChange={(notifyNewApplications) => set({ notifyNewApplications })}
      />
      <SwitchRow
        label="Only my departments"
        description="Limit application alerts to opportunities your departments own."
        checked={draft.onlyMyDepartments}
        onChange={(onlyMyDepartments) => set({ onlyMyDepartments })}
        disabled={!draft.notifyNewApplications}
      />
      <div className="space-y-3">
        <SwitchRow
          label="Closing soon"
          description="A reminder before an opportunity closes, with how many applicants still need review."
          checked={draft.notifyClosingSoon}
          onChange={(notifyClosingSoon) => set({ notifyClosingSoon })}
        />
        {draft.notifyClosingSoon && (
          <Select
            value={String(draft.closingReminderDays)}
            onValueChange={(v) => set({ closingReminderDays: Number(v) })}
          >
            <SelectTrigger className="w-full md:w-56" aria-label="Remind me">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 3, 7, 14].map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {days} day{days === 1 ? "" : "s"} before
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <SwitchRow
        label="Colleagues’ shortlists"
        description="When someone in your departments shortlists an applicant."
        checked={draft.notifyColleagueShortlists}
        onChange={(notifyColleagueShortlists) => set({ notifyColleagueShortlists })}
      />
      <SwitchRow
        label="Weekly summary"
        description="Monday morning: open opportunities, new applicants and what’s closing that week."
        checked={draft.weeklySummary}
        onChange={(weeklySummary) => set({ weeklySummary })}
      />
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">Sent by email to your sign-in address once alerts go live.</p>
        <Button onClick={submit} disabled={pending || !dirty}>
          {pending && <Spinner />}
          Save notifications
        </Button>
      </div>
    </Section>
  );
}
