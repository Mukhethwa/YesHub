"use client";

import { FileSearchIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useState } from "react";

import { runMutation } from "@/components/admin/shared";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Status, Tag } from "@/components/app/status";
import {
  ACTION_LABELS,
  REQUIREMENT_GROUPS,
  RESULT,
  requirementCodes,
  resultCounts,
  TIER_LABELS,
} from "@/components/review/requirements-checklist";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { TenderRequirement } from "../../../convex/schema";

/*
 * The buyer's view of a tender's requirements: have the tender document read into a register, check and
 * edit it, confirm it so applications are checked against it, and see which applicants have what.
 */

type Detail = NonNullable<FunctionReturnType<typeof api.enterprise.opportunity>>;
type Register = NonNullable<Detail["tender"]>;
type Draft = Omit<TenderRequirement, "id" | "source" | "page"> & { id?: string };

const KIND_LABELS: Record<TenderRequirement["kind"], string> = {
  mandatory: "Mandatory requirement",
  scored: "Scored criterion",
  returnable: "Returnable document",
  condition: "Condition",
};

const lines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export function RequirementsTab({ detail }: { detail: Detail }) {
  const register = detail.tender;
  return (
    <div className="space-y-6">
      <ReadCard detail={detail} />
      {register && register.status !== "failed" && (
        <>
          {/* Remounts after each reading, so edits start from what was just read */}
          <RegisterCard key={`${register.readAt ?? 0}-${register.status}`} detail={detail} register={register} />
          {register.status === "confirmed" && <MatrixCard detail={detail} register={register} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Reading the tender                                                                                     */
/* ------------------------------------------------------------------------------------------------------ */

function ReadCard({ detail }: { detail: Detail }) {
  const read = useMutation(api.tenders.readTender);
  const register = detail.tender;
  // Newest first: the tender is usually the document just uploaded
  const pdfs = detail.documents.filter((d) => d.type === "application/pdf").sort((a, b) => b.uploadedAt - a.uploadedAt);
  const [documentId, setDocumentId] = useState<string>(register?.documentId ?? pdfs[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const reading = register?.status === "reading";
  const chosen = pdfs.find((d) => d.id === documentId) ?? pdfs[0];

  const start = async () => {
    if (!chosen) return;
    setPending(true);
    await runMutation("Reading the tender. This takes about a minute.", () =>
      read({ opportunityId: detail.id, documentId: chosen.id }),
    );
    setPending(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tender requirements</CardTitle>
        <CardDescription>
          {register?.status === "confirmed"
            ? `Confirmed by ${register.confirmedBy} on ${formatDateTime(register.confirmedAt!)}. Every application is checked against these, and SMEs see what they still need.`
            : register?.status === "draft"
              ? "Read from the tender. Check each requirement, edit anything that’s wrong, then confirm. Applications aren’t checked against them until you do."
              : "Have the tender document read into its mandatory requirements, scored criteria and returnable documents. You check the list before anyone is assessed on it."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reading ? (
          <p className="flex items-center gap-2 text-sm">
            <Spinner /> Reading {register.documentName}…
          </p>
        ) : pdfs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Upload the tender document as a PDF under Listing and documents, then read it here.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {pdfs.length > 1 && (
              <Select value={chosen?.id} onValueChange={setDocumentId}>
                <SelectTrigger className="sm:w-80" aria-label="Tender document">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pdfs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}: {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={start} disabled={pending} variant={register ? "outline" : "default"}>
              {pending ? <Spinner /> : <FileSearchIcon />}
              {register ? "Read again" : `Read ${pdfs.length === 1 ? pdfs[0].name : "requirements"}`}
            </Button>
            {register?.readAt && (
              <span className="text-xs text-muted-foreground">
                Last read from {register.documentName} on {formatDateTime(register.readAt)}
              </span>
            )}
          </div>
        )}
        {register?.error && !reading && <p className="text-sm text-destructive">{register.error}</p>}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* The register                                                                                           */
/* ------------------------------------------------------------------------------------------------------ */

function toEdited(r: TenderRequirement | Draft): Draft {
  return {
    id: r.id,
    kind: r.kind,
    text: r.text,
    points: r.points,
    scoring: r.scoring,
    items: r.items,
    action: r.action,
    tier: r.tier,
  };
}

function RegisterCard({ detail, register }: { detail: Detail; register: Register }) {
  const save = useMutation(api.tenders.saveRequirements);
  const confirm = useMutation(api.tenders.confirmRequirements);
  const remove = useMutation(api.tenders.removeRequirements);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState(false);
  const [threshold, setThreshold] = useState(register.threshold?.toString() ?? "");
  const [pending, setPending] = useState(false);
  const codes = requirementCodes(register.requirements);
  const locked = register.status === "reading";

  const saveList = (requirements: Draft[], message: string, nextThreshold = register.threshold) =>
    runMutation(message, () =>
      save({ opportunityId: detail.id, requirements: requirements.map(toEdited), threshold: nextThreshold }),
    );

  const saveOne = async (draft: Draft) => {
    const list = register.requirements.map(toEdited);
    const at = draft.id ? list.findIndex((r) => r.id === draft.id) : -1;
    if (at >= 0) list[at] = draft;
    else list.push(draft);
    if (await saveList(list, draft.id ? "Requirement updated." : "Requirement added.")) setEditing(null);
  };

  const deleteOne = (id: string) =>
    saveList(register.requirements.filter((r) => r.id !== id).map(toEdited), "Requirement removed.");

  const saveThreshold = () => {
    const value = threshold.trim() ? Number(threshold) : undefined;
    return saveList(register.requirements.map(toEdited), "Minimum to proceed saved.", value);
  };

  const confirmAll = async () => {
    setPending(true);
    await runMutation("Requirements confirmed. Applications are being checked against them.", () =>
      confirm({ opportunityId: detail.id }),
    );
    setPending(false);
  };

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>
            {register.requirements.length} requirement{register.requirements.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            {register.status === "confirmed" ? (
              <Status tone="success">Confirmed</Status>
            ) : (
              <Status tone="warning">Not confirmed yet</Status>
            )}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={locked}
            onClick={() => setEditing({ kind: "mandatory", text: "" })}
          >
            <PlusIcon /> Add requirement
          </Button>
          {register.status !== "confirmed" && (
            <Button size="sm" disabled={locked || pending} onClick={confirmAll}>
              {pending && <Spinner />}
              Confirm requirements
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {register.gaps.length > 0 && (
          <div className="rounded-md border-l-4 border-l-warning bg-warning/10 p-3 text-sm">
            <p className="font-medium">What the tender doesn’t make clear</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {register.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              SMEs read the tender to apply, so fix these in the document or add them here.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-48">
            <FieldLabel htmlFor="tender-threshold">Minimum technical points</FieldLabel>
            <Input
              id="tender-threshold"
              inputMode="decimal"
              placeholder="None"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={locked}
            />
          </Field>
          <Button
            variant="outline"
            size="sm"
            disabled={locked || threshold.trim() === (register.threshold?.toString() ?? "")}
            onClick={saveThreshold}
          >
            Save minimum
          </Button>
        </div>

        {REQUIREMENT_GROUPS.map((group) => {
          const list = register.requirements.filter((r) => r.kind === group.kind);
          if (!list.length) return null;
          const total = list.reduce((sum, r) => sum + (r.points ?? 0), 0);
          return (
            <section key={group.kind} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {group.title}{" "}
                <span className="font-normal text-muted-foreground">
                  ({list.length}
                  {group.kind === "scored" ? `, ${Math.round(total * 100) / 100} points` : ""})
                </span>
              </h3>
              <ul className="divide-y rounded-lg border">
                {list.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0 space-y-1">
                      <p>
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{codes.get(r.id)}</span>
                        {r.text}
                        {r.points !== undefined && (
                          <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{r.points} points</span>
                        )}
                      </p>
                      {(r.action || r.tier || r.page || r.source === "buyer") && (
                        <p className="flex flex-wrap gap-1.5">
                          {r.action && <Tag>{ACTION_LABELS[r.action]}</Tag>}
                          {r.tier && <Tag>{TIER_LABELS[r.tier]}</Tag>}
                          {r.source === "buyer" ? <Tag>Added by you</Tag> : r.page ? <Tag>Page {r.page}</Tag> : null}
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
                        <p className="text-xs text-muted-foreground">Scoring: {r.scoring.join("; ")}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Edit ${codes.get(r.id)}`}
                        disabled={locked}
                        onClick={() => setEditing(toEdited(r))}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Remove ${codes.get(r.id)}`}
                        disabled={locked}
                        onClick={() => deleteOne(r.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <div className="border-t pt-4">
          <Button variant="ghost" size="sm" disabled={locked} onClick={() => setRemoving(true)}>
            Stop using these requirements
          </Button>
        </div>
      </CardContent>

      {editing && <RequirementDialog draft={editing} onClose={() => setEditing(null)} onSave={saveOne} />}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Stop using these requirements?"
        description="Applications will be checked against the listing’s criteria only. You can read the tender again later."
        confirmLabel="Stop using them"
        destructive
        onConfirm={() => runMutation("Requirements removed.", () => remove({ opportunityId: detail.id }))}
      />
    </Card>
  );
}

function RequirementDialog({
  draft,
  onClose,
  onSave,
}: {
  draft: Draft;
  onClose: () => void;
  onSave: (draft: Draft) => Promise<void>;
}) {
  const [kind, setKind] = useState(draft.kind);
  const [text, setText] = useState(draft.text);
  const [points, setPoints] = useState(draft.points?.toString() ?? "");
  const [items, setItems] = useState((draft.items ?? []).join("\n"));
  const [scoring, setScoring] = useState((draft.scoring ?? []).join("\n"));
  const [action, setAction] = useState(draft.action ?? "submit");
  const [tier, setTier] = useState<string>(draft.tier ?? "none");
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    await onSave({
      id: draft.id,
      kind,
      text,
      points: kind === "scored" && points.trim() ? Number(points) : undefined,
      items: kind === "scored" ? lines(items) : undefined,
      scoring: kind === "scored" ? lines(scoring) : undefined,
      action: kind === "returnable" ? action : undefined,
      tier: kind === "returnable" && tier !== "none" ? (tier as Draft["tier"]) : undefined,
    });
    setPending(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit requirement" : "Add a requirement"}</DialogTitle>
            <DialogDescription>Use the tender’s own wording, so SMEs recognise it.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Kind</FieldLabel>
              <Select value={kind} onValueChange={(value) => setKind(value as Draft["kind"])}>
                <SelectTrigger aria-label="Kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="requirement-text">Requirement</FieldLabel>
              <Textarea
                id="requirement-text"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
              />
            </Field>
            {kind === "scored" && (
              <>
                <Field>
                  <FieldLabel htmlFor="requirement-points">Points</FieldLabel>
                  <Input
                    id="requirement-points"
                    inputMode="decimal"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="requirement-items">Items it counts, one per line</FieldLabel>
                  <Textarea id="requirement-items" rows={3} value={items} onChange={(e) => setItems(e.target.value)} />
                  <FieldDescription>E.g. the skills or accreditations the criterion lists.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="requirement-scoring">How points are awarded, one rule per line</FieldLabel>
                  <Textarea
                    id="requirement-scoring"
                    rows={3}
                    placeholder="Bidder has 5 or more years of experience = 10"
                    value={scoring}
                    onChange={(e) => setScoring(e.target.value)}
                  />
                  <FieldDescription>End each rule with “= points” so it can be scored.</FieldDescription>
                </Field>
              </>
            )}
            {kind === "returnable" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>What the bidder does</FieldLabel>
                  <Select value={action} onValueChange={(value) => setAction(value as typeof action)}>
                    <SelectTrigger aria-label="What the bidder does">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>If it’s missing</FieldLabel>
                  <Select value={tier} onValueChange={setTier}>
                    <SelectTrigger aria-label="If it’s missing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">The tender doesn’t say</SelectItem>
                      {Object.entries(TIER_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !text.trim()}>
              {pending && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Who has what                                                                                           */
/* ------------------------------------------------------------------------------------------------------ */

function MatrixCard({ detail, register }: { detail: Detail; register: Register }) {
  const codes = requirementCodes(register.requirements);
  const columns = REQUIREMENT_GROUPS.flatMap((g) => register.requirements.filter((r) => r.kind === g.kind)).filter(
    (r) => r.kind !== "condition" && r.action !== "review",
  );
  // Shortlisted applicants first: those are the ones the buyer is choosing between
  const order = { awarded: 0, shortlisted: 1, submitted: 2, declined: 3, withdrawn: 4 };
  const rows = detail.applicants
    .filter((a) => a.evaluation.requirements)
    .sort((a, b) => order[a.status] - order[b.status]);
  const waiting = detail.applicants.length - rows.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who has what</CardTitle>
        <CardDescription>
          Each applicant against each requirement, shortlisted applicants first.
          {waiting > 0 && ` ${waiting} application${waiting === 1 ? " is" : "s are"} still being checked.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        {rows.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">No applications have been checked against these yet.</p>
        ) : (
          <>
            {/* The full grid on wide screens; a summary per applicant on phones */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-card">Applicant</TableHead>
                    <TableHead className="text-right">Technical</TableHead>
                    {columns.map((r) => (
                      <TableHead key={r.id} className="px-1.5 text-center font-mono text-xs" title={r.text}>
                        {codes.get(r.id)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => {
                    const results = new Map((a.evaluation.requirements ?? []).map((r) => [r.id, r]));
                    const technical = a.evaluation.technical;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="sticky left-0 z-10 bg-card">
                          <span className="block font-medium">{a.sme.companyName}</span>
                          <span className="text-xs text-muted-foreground capitalize">{a.status}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {technical ? `${technical.points} of ${technical.available}` : "None"}
                        </TableCell>
                        {columns.map((r) => {
                          const result = results.get(r.id);
                          if (!result) return <TableCell key={r.id} />;
                          const look = RESULT[result.status];
                          const Icon = look.icon;
                          return (
                            <TableCell
                              key={r.id}
                              className="px-1.5 text-center"
                              title={`${codes.get(r.id)}: ${look.label}. ${[...result.has, ...result.needs].join(" ")}`}
                            >
                              <Icon
                                aria-label={`${codes.get(r.id)} ${look.label}`}
                                className={cn(
                                  "mx-auto size-4",
                                  look.tone === "success" && "text-success",
                                  look.tone === "warning" && "text-warning",
                                  look.tone === "danger" && "text-destructive",
                                )}
                              />
                              {result.points !== undefined && (
                                <span className="block text-[11px] text-muted-foreground tabular-nums">
                                  {result.points}
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y border-y md:hidden">
              {rows.map((a) => {
                const results = a.evaluation.requirements ?? [];
                const counts = resultCounts(register.requirements, results);
                const lacking = results.filter((r) => r.status !== "met").map((r) => codes.get(r.id));
                return (
                  <li key={a.id} className="space-y-1 px-6 py-3 text-sm">
                    <p className="font-medium">{a.sme.companyName}</p>
                    <p className="text-xs text-muted-foreground">
                      {counts.met} of {results.length} met
                      {a.evaluation.technical
                        ? `, ${a.evaluation.technical.points} of ${a.evaluation.technical.available} technical points`
                        : ""}
                    </p>
                    {lacking.length > 0 && <p className="text-xs">Lacks {lacking.join(", ")}</p>}
                  </li>
                );
              })}
            </ul>

            <details className="px-6 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                What each column means
              </summary>
              <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {columns.map((r) => (
                  <div key={r.id} className="flex gap-2">
                    <dt className="w-8 shrink-0 font-mono text-muted-foreground">{codes.get(r.id)}</dt>
                    <dd>{r.text}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
