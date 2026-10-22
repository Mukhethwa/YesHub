"use client";

import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirms an action, optionally asking for a reason (required for decisions about applicants and
 * suspensions). Used by single and bulk actions alike.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  reason,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Ask for a reason. `required` needs at least 10 characters. */
  reason?: { label?: string; required?: boolean };
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const valid = !reason?.required || text.trim().length >= 10;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    await onConfirm(text.trim());
    setPending(false);
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {reason && (
            <Field>
              <FieldLabel htmlFor="confirm-reason">
                {reason.label ?? "Reason"}
                {!reason.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
              </FieldLabel>
              <Textarea
                id="confirm-reason"
                rows={3}
                maxLength={1000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending || !valid}>
              {pending && <Spinner />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
