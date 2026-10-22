import { cn } from "@/lib/utils";

/** The logo palette, so people and businesses are easy to tell apart in a list. */
const COLOURS = [
  "bg-brand-blue text-white",
  "bg-brand-green text-brand-navy",
  "bg-brand-yellow text-brand-navy",
  "bg-brand-red text-white",
  "bg-brand-navy text-white",
  "bg-primary text-primary-foreground",
];

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Initials on a colour from the logo, chosen from the name so it's the same everywhere. */
export function ColourAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
        COLOURS[hash(name) % COLOURS.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Avatar, name and a secondary line, for table rows. */
export function Identity({ name, detail, className }: { name: string; detail?: string; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <ColourAvatar name={name} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
    </span>
  );
}
