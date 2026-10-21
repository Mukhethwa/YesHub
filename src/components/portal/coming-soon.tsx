import type { LucideIcon } from "lucide-react";

export function ComingSoon({
  title,
  icon: Icon,
  description = "This section is coming in the next build.",
}: {
  title: string;
  icon: LucideIcon;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <Icon className="mb-3 size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
