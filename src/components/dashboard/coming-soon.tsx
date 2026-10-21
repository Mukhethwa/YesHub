import { DASHBOARD_NAV } from "./nav";

export function ComingSoon({ href }: { href: string }) {
  const section = DASHBOARD_NAV.find((s) => s.href === href)!;
  const Icon = section.icon;

  return (
    <div className="flex flex-col items-center py-24 text-center">
      <Icon className="mb-3 size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{section.label}</h1>
      <p className="mt-1 text-sm text-muted-foreground">This section is coming in the next build.</p>
    </div>
  );
}
