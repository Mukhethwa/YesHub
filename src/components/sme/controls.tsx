"use client";

import { FileUpIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DOC_ACCEPT, DOC_MAX_MB } from "@/lib/sme/constants";
import { formatBytes } from "@/lib/sme/format";
import { cn } from "@/lib/utils";

/** Label, control, then either the error or a hint. */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Field data-invalid={!!error || undefined} className={className}>
      <FieldLabel htmlFor={htmlFor} className="flex w-full items-baseline justify-between gap-2">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-muted-foreground">Optional</span>}
      </FieldLabel>
      {children}
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

export function SelectInput({
  id,
  value,
  onChange,
  placeholder,
  options,
  invalid,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
  invalid?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Free-text tags (services, areas, accreditations). Enter or comma adds; pasted lists split on commas. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  suggestions = [],
  invalid,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const has = (tag: string) => value.some((v) => v.toLowerCase() === tag.toLowerCase());

  const add = (raw: string) => {
    const fresh: string[] = [];
    for (const part of raw.split(",")) {
      const tag = part.trim();
      if (tag && !has(tag) && !fresh.some((t) => t.toLowerCase() === tag.toLowerCase())) fresh.push(tag);
    }
    if (fresh.length) onChange([...value, ...fresh]);
    setDraft("");
  };

  // Whatever follows the last comma stays as the draft
  const onDraftChange = (text: string) => {
    const cut = text.lastIndexOf(",");
    if (cut === -1) return setDraft(text);
    add(text.slice(0, cut));
    setDraft(text.slice(cut + 1).trimStart());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const remaining = suggestions.filter((s) => !has(s));

  return (
    <div>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
          invalid && "border-destructive ring-destructive/20 dark:ring-destructive/40",
        )}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-0.5 pl-2 text-sm">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== tag))}
              aria-label={`Remove ${tag}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={value.length ? "Add another…" : placeholder}
          aria-invalid={invalid || undefined}
          className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Suggestions</span>
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-md border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select as toggle buttons (provinces, opportunity types). */
export function ChipGroup({
  id,
  options,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div id={id} tabIndex={id ? -1 : undefined} className="flex flex-wrap gap-2 outline-none">
      {options.map((option) => {
        const on = disabled || value.includes(option);
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== option) : [...value, option])}
          >
            {option}
          </Button>
        );
      })}
    </div>
  );
}

/** A setting with a label, description and switch. `plain` drops the border for lists of settings. */
export function SwitchRow({
  checked,
  onChange,
  label,
  description,
  plain,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  plain?: boolean;
}) {
  const id = useId();
  return (
    <Field
      orientation="horizontal"
      className={cn("items-start justify-between gap-4", plain ? "py-3.5" : "rounded-lg border p-4")}
    >
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </Field>
  );
}

/** Returns a message when the file can't be accepted, otherwise null. */
export function checkFile(file: File) {
  const allowed = DOC_ACCEPT.split(",");
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  if (!allowed.includes(ext)) return "Upload a PDF, JPG or PNG file";
  if (file.size > DOC_MAX_MB * 1024 * 1024) return `That file is larger than ${DOC_MAX_MB} MB`;
  return null;
}

/** Pick or drop one document. Shows the chosen file with Replace / Remove once there is one. */
export function FileDrop({
  id,
  file,
  onChange,
  invalid,
}: {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  invalid?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const take = (picked: File | undefined) => {
    if (!picked) return;
    const issue = checkFile(picked);
    setProblem(issue);
    if (!issue) onChange(picked);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={DOC_ACCEPT}
      tabIndex={-1}
      aria-hidden
      className="sr-only"
      onChange={(e) => {
        take(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  if (file) {
    return (
      <div className="flex items-center gap-2 rounded-md border py-2 pr-2 pl-3">
        {input}
        <FileUpIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · Ready to upload</p>
        </div>
        <Button id={id} type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
          Replace
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove ${file.name}`}
          onClick={() => onChange(null)}
        >
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div>
      {input}
      <button
        id={id}
        type="button"
        data-invalid={invalid || !!problem || undefined}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border border-dashed px-4 py-4 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          dragging
            ? "border-primary bg-primary/5"
            : invalid || problem
              ? "border-destructive"
              : "hover:border-foreground/40 hover:bg-muted/50",
        )}
      >
        <FileUpIcon className="size-5 shrink-0 text-muted-foreground" />
        <span>
          <span className="block text-sm font-medium">
            Drop file here or <span className="text-primary underline underline-offset-2">browse</span>
          </span>
          <span className="block text-xs text-muted-foreground">PDF, JPG or PNG · up to {DOC_MAX_MB} MB</span>
        </span>
      </button>
      {problem && <p className="mt-1.5 text-sm text-destructive">{problem}</p>}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("-mb-1 pt-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase", className)}>
      {children}
    </p>
  );
}

/** Label / value row for read-only profile views. */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 text-sm sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-muted-foreground/70">Not provided</span>}</dd>
    </div>
  );
}

export function Chips({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
          {item}
        </span>
      ))}
    </span>
  );
}
