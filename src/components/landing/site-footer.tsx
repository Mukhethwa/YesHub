import Link from "next/link";

import { Logo } from "@/components/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#for-smes", label: "For SMEs" },
      { href: "/#for-buyers", label: "For enterprises and funders" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#fairness", label: "Fairness and the law" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/auth/sign-in", label: "Sign in" },
      { href: "/auth/sign-up", label: "Register your business" },
      { href: "/auth/sign-up", label: "Post an opportunity" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.5fr_1fr_1fr] md:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Procurement between South African enterprises and SMEs: matched, scored and on the record.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="space-y-3 text-sm">
            <p className="font-medium">{column.title}</p>
            <ul className="space-y-2 text-muted-foreground">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground md:px-6">YES AI Hub, Challenge 4</div>
      <div aria-hidden className="grid h-1 grid-cols-4">
        <span className="bg-brand-yellow" />
        <span className="bg-brand-green" />
        <span className="bg-brand-red" />
        <span className="bg-brand-blue" />
      </div>
    </footer>
  );
}
