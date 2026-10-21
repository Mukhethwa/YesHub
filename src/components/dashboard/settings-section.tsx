"use client";

import { useMutation } from "convex/react";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ChipGroup, FormField, SelectInput, SwitchRow } from "@/components/sme/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/sme/format";
import { CONTRACT_VALUES, LANGUAGES, OPPORTUNITY_TYPES, REMINDER_DAYS, getSettings } from "@/lib/sme/settings";
import type { SmeProfile } from "@/lib/sme/types";
import { cn } from "@/lib/utils";
import type { SmeSettings } from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { SectionHeader } from "./require-sme";

export function SettingsSection({ sme }: { sme: SmeProfile }) {
  const updateSettings = useMutation(api.smes.updateSettings);
  const saved = getSettings(sme);
  const [draft, setDraft] = useState<SmeSettings>(saved);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<SmeSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const noChannels = !draft.notifyEmail && !draft.notifySms && !draft.notifyWhatsapp;

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings({ settings: draft });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const downloadData = () => {
    // Internal ids aren't the user's data
    const profile: Partial<SmeProfile> = { ...sme };
    delete profile._id;
    delete profile.userId;
    const data = JSON.stringify({ ...profile, settings: saved, exportedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `yes-hub-${sme.companyName.replace(/[^\w]+/g, "-").toLowerCase()}-data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Settings"
        description="Choose how we alert you, what we match you to and who can see your profile."
      />

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Where we send opportunity alerts and reminders.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            <SwitchRow plain checked={draft.notifyEmail} onChange={(notifyEmail) => set({ notifyEmail })} label="Email" description={sme.email} />
            <SwitchRow plain checked={draft.notifySms} onChange={(notifySms) => set({ notifySms })} label="SMS" description={sme.phone} />
            <SwitchRow
              plain
              checked={draft.notifyWhatsapp}
              onChange={(notifyWhatsapp) => set({ notifyWhatsapp })}
              label="WhatsApp"
              description={`${sme.phone}. Works well on low data.`}
            />
          </div>
          {noChannels && (
            <p className="mt-2 text-sm text-destructive">
              With every channel off you won’t receive any alerts, including closing date reminders.
            </p>
          )}
          <FormField label="Language for alerts" htmlFor="language" className="mt-4 md:max-w-xs">
            <SelectInput
              id="language"
              value={draft.language}
              onChange={(language) => set({ language })}
              placeholder="Select language"
              options={LANGUAGES}
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>What we notify you about.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            <SwitchRow
              plain
              checked={draft.alertNewMatches}
              onChange={(alertNewMatches) => set({ alertNewMatches })}
              label="New matching opportunities"
              description="As soon as a tender, RFQ or grant that fits your profile is published."
            />
            <div>
              <SwitchRow
                plain
                checked={draft.alertDeadlines}
                onChange={(alertDeadlines) => set({ alertDeadlines })}
                label="Closing date reminders"
                description="For opportunities you’ve saved or started applying to."
              />
              {draft.alertDeadlines && (
                <FormField label="Remind me" htmlFor="deadlineReminderDays" className="pb-4 md:max-w-xs">
                  <SelectInput
                    id="deadlineReminderDays"
                    value={draft.deadlineReminderDays}
                    onChange={(deadlineReminderDays) => set({ deadlineReminderDays })}
                    placeholder="Select"
                    options={REMINDER_DAYS}
                  />
                </FormField>
              )}
            </div>
            <SwitchRow
              plain
              checked={draft.alertStatusUpdates}
              onChange={(alertStatusUpdates) => set({ alertStatusUpdates })}
              label="Shortlist and application updates"
              description="When a corporate or funder shortlists you, asks a question or makes a decision."
            />
            <SwitchRow
              plain
              checked={draft.alertDocExpiry}
              onChange={(alertDocExpiry) => set({ alertDocExpiry })}
              label="Document expiry reminders"
              description="30 days before your B-BBEE certificate or tax clearance expires."
            />
            <SwitchRow
              plain
              checked={draft.weeklyDigest}
              onChange={(weeklyDigest) => set({ weeklyDigest })}
              label="Weekly summary"
              description="One email every Monday with open opportunities in your area."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Matching preferences</CardTitle>
          <CardDescription>Narrow down which opportunities we match you to.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormField label="Opportunity types" htmlFor="opportunityTypes" hint="Leave them all selected to see everything.">
            <ChipGroup
              id="opportunityTypes"
              options={OPPORTUNITY_TYPES}
              value={draft.opportunityTypes}
              onChange={(opportunityTypes) => set({ opportunityTypes })}
            />
          </FormField>
          {draft.opportunityTypes.length === 0 && (
            <p className="mt-2 text-sm text-destructive">Select at least one type, or you won’t be matched to anything.</p>
          )}
          <FormField label="Minimum contract value" htmlFor="minContractValue" className="mt-5 md:max-w-xs">
            <SelectInput
              id="minContractValue"
              value={draft.minContractValue}
              onChange={(minContractValue) => set({ minContractValue })}
              placeholder="Select"
              options={CONTRACT_VALUES}
            />
          </FormField>
          <div className="mt-2 border-t">
            <SwitchRow
              plain
              checked={draft.eligibleOnly}
              onChange={(eligibleOnly) => set({ eligibleOnly })}
              label="Only show opportunities I qualify for"
              description="Hide opportunities that need a B-BBEE level, grading or province you don’t have yet."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data and privacy</CardTitle>
          <CardDescription>You gave consent to share your profile on {formatDate(sme.consentedAt)}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            <SwitchRow
              plain
              checked={draft.lowDataMode}
              onChange={(lowDataMode) => set({ lowDataMode })}
              label="Low-data mode"
              description="Lighter pages and text-only alerts for slow or expensive connections."
            />
            <SwitchRow
              plain
              checked={draft.profileVisible}
              onChange={(profileVisible) => set({ profileVisible })}
              label="Show my profile to corporates and funders"
              description="Turning this off pauses all matching. Your data stays saved."
            />
            <SwitchRow
              plain
              checked={draft.shareContactAfterShortlist}
              onChange={(shareContactAfterShortlist) => set({ shareContactAfterShortlist })}
              label="Share contact details only after I’m shortlisted"
              description="Buyers see your company profile first and your name, email and number once they shortlist you."
            />
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Download a copy of everything we hold about your business.</p>
            <Button variant="outline" onClick={downloadData}>
              Download my data
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border bg-card px-5 py-4 shadow-md sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm", !dirty && "text-muted-foreground")}>
          {dirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
            Discard
          </Button>
          <Button disabled={!dirty || saving} onClick={save}>
            {saving && <Spinner />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in and security</CardTitle>
          <CardDescription>Your password, sign-in email and active sessions are managed with your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/settings/security">
              Account security
              <ArrowRightIcon />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <DeleteProfileCard sme={sme} />
    </div>
  );
}

function DeleteProfileCard({ sme }: { sme: SmeProfile }) {
  const router = useRouter();
  const deleteProfile = useMutation(api.smes.deleteProfile);
  const [understood, setUnderstood] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = confirmName.trim().toLowerCase() === sme.companyName.trim().toLowerCase();

  const submit = async () => {
    setBusy(true);
    try {
      await deleteProfile();
      toast.success("Your business profile was deleted");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete business profile</CardTitle>
        <CardDescription>
          Withdraw your consent and permanently remove your business profile and documents. Your account stays, so you
          can register again later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox checked={understood} onCheckedChange={(checked) => setUnderstood(checked === true)} className="mt-0.5" />
          <span>I understand that {sme.companyName} and all its documents will be deleted and can’t be recovered.</span>
        </label>
        {understood && (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (matches) void submit();
            }}
          >
            <FormField label={`Type “${sme.companyName}” to confirm`} htmlFor="confirmDelete" className="sm:w-80">
              <Input id="confirmDelete" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
            </FormField>
            <Button type="submit" variant="destructive" disabled={busy || !matches}>
              {busy && <Spinner />}
              {busy ? "Deleting…" : "Delete profile"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
