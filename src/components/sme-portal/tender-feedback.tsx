"use client";

import { CircleCheckIcon, PlusIcon } from "lucide-react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Tag } from "@/components/app/status";
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
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type Outstanding, WEIGHTS } from "../../../convex/lib/outstanding";

/*
 * The SME's side of a tender's requirements: which documents are still outstanding, and what to do about
 * each. Standard company documents are uploaded once on the Documents tab and count for every tender; the
 * tender's own forms are completed, signed and attached to the application. Scores and points stay with the
 * buyer: the SME sees recommendations, not the evaluation.
 */

const MAX_ATTACHMENTS = 5;
const ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg";

/** Outstanding documents, grouped by where they go. */
export function OutstandingDocuments({
  items,
  applied,
  application,
  canChange = false,
}: {
  items: Outstanding[];
  applied: boolean;
  application?: { id: Id<"applications">; attachments: { label: string; name: string }[] };
  canChange?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CircleCheckIcon className="size-4 text-success" aria-hidden />
        {applied
          ? "Every document the tender asks for is in order."
          : "Your profile has every standard document this tender asks for."}
      </p>
    );
  }
  const onProfile = items.filter((i) => i.where === "profile");
  const toAttach = items.filter((i) => i.where === "application");
  return (
    <div className="space-y-6">
      {onProfile.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Upload to your Documents tab ({onProfile.length})</h3>
            <Button size="sm" variant="outline" asChild>
              <Link href="/sme/documents">Go to Documents</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Standard company documents count for every tender
            {applied ? ", and your application is checked again when you upload one" : ""}.
          </p>
          <ItemList items={onProfile} />
        </section>
      )}
      {toAttach.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {applied ? "Attach to your application" : "Bring these when you apply"} ({toAttach.length})
            </h3>
            {applied && canChange && application && (
              <AddDocumentsButton
                application={application}
                suggestions={toAttach.filter((i) => !i.name.includes(":")).map((i) => i.name)}
              />
            )}
          </div>
          <ItemList items={toAttach} />
        </section>
      )}
    </div>
  );
}

function ItemList({ items }: { items: Outstanding[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "space-y-1 p-3 text-sm",
            item.weight === "disqualifies" && "border-l-4 border-l-destructive",
            item.weight === "may-disqualify" && "border-l-4 border-l-warning",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 font-medium">{item.name}</p>
            <Tag>{WEIGHTS[item.weight]}</Tag>
          </div>
          <p className="text-xs text-muted-foreground">{item.todo}</p>
        </li>
      ))}
    </ul>
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
