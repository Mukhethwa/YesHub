"use client";

import { PlusIcon } from "lucide-react";
import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Status, Tag } from "@/components/app/status";
import {
  ACTION_LABELS,
  REQUIREMENT_GROUPS,
  requirementCodes,
  TIER_LABELS,
} from "@/components/review/requirements-checklist";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useUploadFile } from "@/hooks/use-upload-file";
import { errorMessage } from "@/lib/errors";
import { DOCUMENTS, docStatus } from "@/lib/sme/documents";
import type { SmeProfile } from "@/lib/sme/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PROFILE_RETURNABLES, returnableKey } from "../../../convex/lib/tender";
import type { DocKey, TenderRequirement } from "../../../convex/schema";

/*
 * The SME's side of a tender's requirements: what the tender asks for and which documents the profile
 * already covers, and adding documents to an application while the tender is open. SMEs never see how their
 * application was assessed against these.
 */

type Tender = { requirements: TenderRequirement[]; threshold: number | null; documentName: string | null };

const MAX_ATTACHMENTS = 5;
const ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg";

/** A returnable the profile can answer, and whether the profile has a current copy. */
function fromProfile(r: TenderRequirement, sme: SmeProfile) {
  const key = PROFILE_RETURNABLES[returnableKey(r.text)] as DocKey | undefined;
  if (!key) return null;
  return { label: DOCUMENTS.find((d) => d.key === key)?.label ?? key, status: docStatus(sme, key) };
}

/** What the tender asks for, before the SME applies. */
export function TenderPreview({ tender, sme }: { tender: Tender; sme: SmeProfile }) {
  const codes = requirementCodes(tender.requirements);
  const scored = tender.requirements.filter((r) => r.kind === "scored");
  const toAttach = tender.requirements.filter(
    (r) => r.kind === "returnable" && r.action !== "review" && fromProfile(r, sme)?.status !== "ok",
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Your application is checked against each of these
        {tender.documentName ? `, read from ${tender.documentName}` : ""}.{" "}
        {scored.length > 0 &&
          `Scored criteria carry ${scored.reduce((sum, r) => sum + (r.points ?? 0), 0)} points${
            tender.threshold !== null ? `; you need at least ${tender.threshold} to proceed` : ""
          }. `}
        {toAttach.length > 0 &&
          `Attach the ${toAttach.length} document${toAttach.length === 1 ? "" : "s"} your profile doesn’t cover when you apply.`}
      </p>
      {REQUIREMENT_GROUPS.map((group) => {
        const list = tender.requirements.filter((r) => r.kind === group.kind && r.action !== "review");
        if (!list.length) return null;
        return (
          <div key={group.kind}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{group.title}</p>
            <ul className="divide-y rounded-lg border">
              {list.map((r) => {
                const profile = r.kind === "returnable" ? fromProfile(r, sme) : null;
                return (
                  <li key={r.id} className="space-y-1.5 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{codes.get(r.id)}</span>
                        {r.text}
                      </p>
                      {r.points !== undefined && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.points} points</span>
                      )}
                      {profile &&
                        (profile.status === "ok" ? (
                          <Status tone="success">On your profile</Status>
                        ) : (
                          <Status tone="warning">
                            {profile.status === "expired" ? "Renew on your profile" : "Add to your profile"}
                          </Status>
                        ))}
                    </div>
                    {(r.action || r.tier) && (
                      <p className="flex flex-wrap gap-1.5">
                        {r.action && <Tag>{ACTION_LABELS[r.action]}</Tag>}
                        {r.tier && <Tag>{TIER_LABELS[r.tier]}</Tag>}
                      </p>
                    )}
                    {r.items && r.items.length > 0 && (
                      <ul className="list-disc pl-5 text-xs text-muted-foreground">
                        {r.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                    {r.scoring && r.scoring.length > 0 && (
                      <p className="text-xs text-muted-foreground">How it’s scored: {r.scoring.join("; ")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

type NewFile = { id: number; label: string; file: File | null };

export function AddDocumentsButton({
  application,
  suggestions = [],
}: {
  application: { id: Id<"applications">; attachments: { label: string; name: string }[] };
  suggestions?: string[];
}) {
  const addDocuments = useMutation(api.smeOpportunities.addDocuments);
  const upload = useUploadFile();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [remove, setRemove] = useState<number[]>([]);
  const [files, setFiles] = useState<NewFile[]>([]);

  const room = MAX_ATTACHMENTS - (application.attachments.length - remove.length);
  const ready = files.length > 0 && files.every((f) => f.file && f.label.trim());
  const add = (label = "") => setFiles((list) => [...list, { id: Date.now() + list.length, label, file: null }]);
  const update = (id: number, change: Partial<NewFile>) =>
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...change } : f)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const uploaded = [];
      for (const f of files) uploaded.push({ ...(await upload(f.file!)), label: f.label.trim() });
      await addDocuments({ applicationId: application.id, attachments: uploaded, remove });
      toast.success("Documents added to your application.");
      setOpen(false);
      setFiles([]);
      setRemove([]);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t add the documents."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          Add documents
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add documents</DialogTitle>
            <DialogDescription>
              PDF, JPG or PNG, up to 10 MB each. An application holds {MAX_ATTACHMENTS} documents; remove one you’re
              replacing, such as an unsigned form.
            </DialogDescription>
          </DialogHeader>

          {application.attachments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Already sent</p>
              {application.attachments.map((a, i) => (
                <label key={`${a.name}-${i}`} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={remove.includes(i)}
                    onCheckedChange={(checked) =>
                      setRemove((list) => (checked ? [...list, i] : list.filter((n) => n !== i)))
                    }
                  />
                  <span>
                    Remove {a.label} <span className="text-muted-foreground">({a.name})</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Still needed</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={files.length >= room || files.some((f) => f.label === s)}
                    onClick={() => add(s)}
                  >
                    <PlusIcon /> {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {files.map((f) => (
            <div key={f.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex gap-2">
                <Input
                  aria-label="What this document is"
                  placeholder="What it is, e.g. SBD 4 declaration"
                  value={f.label}
                  onChange={(e) => update(f.id, { label: e.target.value })}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiles((list) => list.filter((x) => x.id !== f.id))}
                >
                  Remove
                </Button>
              </div>
              <Input
                type="file"
                accept={ATTACHMENT_ACCEPT}
                aria-label="File"
                onChange={(e) => update(f.id, { file: e.target.files?.[0] ?? null })}
                required
              />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={files.length >= room} onClick={() => add()}>
            Add another document
          </Button>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !ready || files.length > room}>
              {pending && <Spinner />}
              Add to application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
