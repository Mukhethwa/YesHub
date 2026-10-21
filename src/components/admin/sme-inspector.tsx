"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { DOCUMENTS, docStatus, expiryFor } from "@/lib/sme/documents";
import { formatDate, websiteHref } from "@/lib/sme/format";
import { getReadiness } from "@/lib/sme/readiness";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Pill } from "./page-header";
import { formatDateTime, runMutation } from "./shared";

/** Side panel for one SME: business details, documents, readiness and moderation. */
export function SmeInspector({ smeId, onClose }: { smeId: Id<"smes"> | null; onClose: () => void }) {
  return (
    <Sheet open={!!smeId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {smeId && <Inspector key={smeId} smeId={smeId} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function Inspector({ smeId, onClose }: { smeId: Id<"smes">; onClose: () => void }) {
  const sme = useQuery(api.admin.sme, { smeId });

  if (sme === undefined) {
    return (
      <>
        <SheetTitle className="sr-only">Loading SME</SheetTitle>
        <Spinner className="m-auto mt-24" />
      </>
    );
  }
  if (sme === null) {
    return (
      <SheetHeader className="p-6">
        <SheetTitle>SME not found</SheetTitle>
        <SheetDescription>It may have been deleted.</SheetDescription>
      </SheetHeader>
    );
  }

  const { checks, score } = getReadiness(sme);

  return (
    <>
      <SheetHeader className="border-b p-6">
        <SheetTitle className="text-lg">{sme.companyName}</SheetTitle>
        <SheetDescription>
          {sme.industry} · {sme.city}, {sme.hqProvince}
        </SheetDescription>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusPill sme={sme} />
          <Pill tone={score >= 75 ? "success" : score >= 50 ? "warning" : "danger"}>{score}% match-ready</Pill>
          {sme.isDemo && <Pill>Sample data</Pill>}
        </div>
      </SheetHeader>

      <div className="space-y-8 p-6">
        <Section title="Business">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Registration number" value={sme.registrationNumber} />
            <Detail label="CSD number" value={sme.csdNumber} />
            <Detail label="B-BBEE level" value={sme.bbbeeLevel} />
            <Detail label="Years trading" value={sme.yearsTrading} />
            <Detail label="Employees" value={sme.employees} />
            <Detail
              label="Website"
              value={
                sme.website && (
                  <a href={websiteHref(sme.website)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {sme.website}
                  </a>
                )
              }
            />
            <Detail label="Address" value={sme.address} wide />
            <Detail label="Coverage" value={sme.nationwide ? "Nationwide" : sme.provinces.join(", ")} wide />
            <Detail label="Services" value={sme.services.join(", ")} wide />
          </dl>
        </Section>

        <Separator />

        <Section title="Contact">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Contact person" value={[sme.contactName, sme.contactRole].filter(Boolean).join(", ")} />
            <Detail label="Phone" value={sme.phone} />
            <Detail label="Email" value={sme.email && <a href={`mailto:${sme.email}`}>{sme.email}</a>} />
            <Detail label="Account" value={sme.owner ? `${sme.owner.name} (${sme.owner.email})` : "Deleted account"} />
            <Detail label="Registered" value={formatDate(sme._creationTime)} />
          </dl>
        </Section>

        <Separator />

        <Section title="Documents">
          <ul className="divide-y rounded-lg border">
            {DOCUMENTS.map((doc) => {
              const status = docStatus(sme, doc.key);
              const url = sme.documentUrls[doc.key];
              const expiry = expiryFor(sme, doc.key);
              return (
                <li key={doc.key} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{doc.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {status === "missing"
                          ? doc.required
                            ? "Required, not uploaded"
                            : "Not uploaded"
                          : `${sme.documents[doc.key]?.name}${expiry ? ` · expires ${formatDate(expiry)}` : ""}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {status === "expired" && <Pill tone="danger">Expired</Pill>}
                    {status === "missing" && doc.required && <Pill tone="warning">Missing</Pill>}
                    {url && (
                      <Button asChild variant="outline" size="sm">
                        <a href={url} target="_blank" rel="noreferrer">
                          Open
                          <ExternalLinkIcon />
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Separator />

        <Section title="Readiness" description="What’s holding this SME back from being matched.">
          <ul className="space-y-1.5 text-sm">
            {checks.map((check) => (
              <li key={check.id} className="flex gap-2">
                <span className={check.passed ? "text-success" : "text-destructive"}>{check.passed ? "✓" : "✗"}</span>
                <span className={check.passed ? "" : "text-muted-foreground"}>{check.label}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Separator />

        <Moderation sme={sme} onDeleted={onClose} />
      </div>
    </>
  );
}

type SmeDetail = NonNullable<FunctionReturnType<typeof api.admin.sme>>;

export function StatusPill({ sme }: { sme: { verifiedAt?: number; suspendedAt?: number } }) {
  if (sme.suspendedAt) return <Pill tone="danger">Suspended</Pill>;
  if (sme.verifiedAt) return <Pill tone="success">Verified</Pill>;
  return <Pill tone="warning">Unverified</Pill>;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-medium">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value || "—"}</dd>
    </div>
  );
}

function Moderation({ sme, onDeleted }: { sme: SmeDetail; onDeleted: () => void }) {
  const { can } = useStaffPermissions();
  const setVerified = useMutation(api.admin.setSmeVerified);
  const setSuspended = useMutation(api.admin.setSmeSuspended);
  const deleteSme = useMutation(api.admin.deleteSme);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Section title="Moderation" description="Changes are recorded in the audit log.">
      <div className="divide-y rounded-lg border">
        <Row
          title={sme.verifiedAt ? "Verified" : "Verify"}
          description={
            sme.verifiedAt
              ? `Checked by ${sme.verifiedBy ?? "staff"} on ${formatDateTime(sme.verifiedAt)}.`
              : "Mark the profile and documents as checked. Enterprises see a verified badge."
          }
        >
          <Button
            variant="outline"
            size="sm"
            disabled={!can({ sme: ["verify"] })}
            onClick={() =>
              runMutation(sme.verifiedAt ? "Verification removed" : "SME verified", () =>
                setVerified({ smeId: sme._id, verified: !sme.verifiedAt }),
              )
            }
          >
            {sme.verifiedAt ? "Remove verification" : "Verify"}
          </Button>
        </Row>
        <Row
          title={sme.suspendedAt ? "Suspended" : "Suspend"}
          description={
            sme.suspendedAt
              ? `${sme.suspendedReason || "No reason given"} · since ${formatDateTime(sme.suspendedAt)}`
              : "Hide the SME from matching. Their account still works."
          }
        >
          {sme.suspendedAt ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!can({ sme: ["suspend"] })}
              onClick={() => runMutation("SME reinstated", () => setSuspended({ smeId: sme._id, suspended: false }))}
            >
              Reinstate
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={!can({ sme: ["suspend"] })} onClick={() => setSuspendOpen(true)}>
              Suspend…
            </Button>
          )}
        </Row>
        <Row title="Delete profile" description="Delete the SME profile and its documents. The account stays and can register again.">
          <Button variant="destructive" size="sm" disabled={!can({ sme: ["delete"] })} onClick={() => setDeleteOpen(true)}>
            Delete…
          </Button>
        </Row>
      </div>

      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {sme.companyName}?</AlertDialogTitle>
            <AlertDialogDescription>They won’t appear in matches until reinstated.</AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="suspend-reason">Reason</FieldLabel>
            <Textarea id="suspend-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <FieldDescription>Visible to staff only.</FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                runMutation("SME suspended", () => setSuspended({ smeId: sme._id, suspended: true, reason })).then(
                  (ok) => ok && setReason(""),
                )
              }
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {sme.companyName}?</AlertDialogTitle>
            <AlertDialogDescription>The profile and every uploaded document are deleted. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (await runMutation("SME deleted", () => deleteSme({ smeId: sme._id }))) onDeleted();
              }}
            >
              Delete profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
